import { monitorEventLoopDelay } from "node:perf_hooks";
import { withTimeout } from "@autumn/shared";
import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import { waitForRedisReady } from "../initUtils/redisWarmup.js";
import { describeRedisConnections } from "../initUtils/createStandbyRedisRouter.js";

const REDIS_ERROR_LOG_INTERVAL_MS = 30_000;
const REDIS_PROBE_INTERVAL_MS = 2_000;
const REDIS_PROBE_TIMEOUT_MS = 1_000;
const REDIS_FAILURES_TO_DEGRADE = 5;
const REDIS_SUCCESSES_TO_RECOVER = 3;
const REDIS_LOOP_LAG_INCONCLUSIVE_MS = 500;
const REDIS_MAX_CONSECUTIVE_INCONCLUSIVE = 300;

type RedisAvailabilityState = "healthy" | "degraded";

export type ProbeOutcome =
	| "available"
	| "connection_down"
	| "unresponsive_while_ready";

export type ProbeClassification = "available" | "unavailable" | "inconclusive";

export type RedisAvailabilitySnapshot = {
	configured: boolean;
	state: RedisAvailabilityState;
	status: string;
};

export const classifyProbe = ({
	outcome,
	eventLoopLagMs,
	thresholdMs,
}: {
	outcome: ProbeOutcome;
	eventLoopLagMs: number;
	thresholdMs: number;
}): ProbeClassification => {
	if (outcome === "available") return "available";
	if (outcome === "connection_down") return "unavailable";
	return eventLoopLagMs > thresholdMs ? "inconclusive" : "unavailable";
};

export const histogramMaxToMs = (maxNanoseconds: number): number =>
	maxNanoseconds / 1e6;

export const createRedisAvailability = ({
	getRedis,
	hasConfig,
	logPrefix,
	logType,
	getEventLoopLagMs,
	maxConsecutiveInconclusive = REDIS_MAX_CONSECUTIVE_INCONCLUSIVE,
}: {
	getRedis: () => Redis;
	hasConfig: boolean;
	logPrefix: string;
	logType: string;
	getEventLoopLagMs?: () => number;
	maxConsecutiveInconclusive?: number;
}) => {
	let probeRedis: Redis | null = null;
	let probeSourceRedis: Redis | null = null;
	// Optimistic start: a boot-time gate check must not read as an outage. A real
	// outage degrades after failuresToDegrade probes; per-op timeouts bound the gap.
	let redisAvailabilityState: RedisAvailabilityState = "healthy";
	let redisMonitorInterval: ReturnType<typeof setInterval> | null = null;
	let redisTickInFlight = false;
	let lastAvailabilityLogAt = 0;
	let lastInconclusiveLogAt = 0;
	let consecutiveFailures = 0;
	let consecutiveSuccesses = 0;
	let consecutiveInconclusive = 0;
	let lastEventLoopLagMs = 0;

	// Probes run on a dedicated duplicate so main-client saturation can't mask an
	// outage; recreated whenever getRedis() starts returning a different instance.
	const getOrCreateProbeRedis = (): Redis => {
		const sourceRedis = getRedis();
		if (!hasConfig) return sourceRedis;
		if (probeRedis && probeSourceRedis === sourceRedis) return probeRedis;

		if (probeRedis && probeRedis.status !== "end") probeRedis.disconnect();
		probeRedis = sourceRedis.duplicate();
		probeRedis.on("error", () => {});
		probeSourceRedis = sourceRedis;
		return probeRedis;
	};

	const getProbeRedisStatus = () => probeRedis?.status ?? "not_initialized";

	const loopLagSampler = ((): {
		begin: () => void;
		end: () => number;
		stop: () => void;
	} => {
		if (getEventLoopLagMs) {
			return {
				begin: () => {},
				end: () => getEventLoopLagMs(),
				stop: () => {},
			};
		}

		let histogram: ReturnType<typeof monitorEventLoopDelay> | null = null;
		try {
			histogram = monitorEventLoopDelay({ resolution: 20 });
			histogram.enable();
		} catch {
			histogram = null;
		}

		if (!histogram) {
			logger.warn(
				`[${logPrefix}] Event-loop delay monitor unavailable; lag-aware degrade suppression disabled`,
				{ type: logType },
			);
			return { begin: () => {}, end: () => 0, stop: () => {} };
		}

		const activeHistogram = histogram;
		return {
			begin: () => activeHistogram.reset(),
			end: () => {
				const maxMs = histogramMaxToMs(activeHistogram.max);
				return Number.isFinite(maxMs) && maxMs > 0 ? maxMs : 0;
			},
			stop: () => activeHistogram.disable(),
		};
	})();

	const setRedisAvailabilityState = (state: RedisAvailabilityState) => {
		const previousState = redisAvailabilityState;
		const now = Date.now();
		const shouldLog =
			previousState !== state ||
			(state === "degraded" &&
				now - lastAvailabilityLogAt >= REDIS_ERROR_LOG_INTERVAL_MS);
		if (!shouldLog) return;

		redisAvailabilityState = state;
		lastAvailabilityLogAt = now;
		const redis = getRedis();

		logger[state === "healthy" ? "info" : "warn"](
			state === "healthy"
				? `[${logPrefix}] Recovered`
				: `[${logPrefix}] Unavailable, skipping Redis-backed features`,
			{
				type: logType,
				previousState,
				state,
				redisStatus: redis.status,
				redisConnections: describeRedisConnections(redis),
				probeRedisStatus: getProbeRedisStatus(),
				consecutiveFailures,
				consecutiveSuccesses,
				eventLoopLagMs: lastEventLoopLagMs,
				failuresToDegrade: REDIS_FAILURES_TO_DEGRADE,
				successesToRecover: REDIS_SUCCESSES_TO_RECOVER,
			},
		);
	};

	const recordRedisAvailability = (classification: ProbeClassification) => {
		if (classification === "inconclusive") {
			consecutiveSuccesses = 0;
			return;
		}

		const available = classification === "available";
		consecutiveSuccesses = available ? consecutiveSuccesses + 1 : 0;
		consecutiveFailures = available ? 0 : consecutiveFailures + 1;

		if (consecutiveSuccesses >= REDIS_SUCCESSES_TO_RECOVER)
			setRedisAvailabilityState("healthy");
		if (consecutiveFailures >= REDIS_FAILURES_TO_DEGRADE)
			setRedisAvailabilityState("degraded");
	};

	const logInconclusiveProbe = () => {
		const now = Date.now();
		if (now - lastInconclusiveLogAt < REDIS_ERROR_LOG_INTERVAL_MS) return;
		lastInconclusiveLogAt = now;
		logger.warn(`[${logPrefix}] Probe inconclusive under event-loop lag`, {
			type: logType,
			redisStatus: getRedis().status,
			probeRedisStatus: getProbeRedisStatus(),
			consecutiveFailures,
			eventLoopLagMs: lastEventLoopLagMs,
			loopLagThresholdMs: REDIS_LOOP_LAG_INCONCLUSIVE_MS,
		});
	};

	const pingRedisClient = async (activeProbeRedis: Redis) => {
		if (activeProbeRedis.status !== "ready") return false;

		const pong = await withTimeout({
			timeoutMs: REDIS_PROBE_TIMEOUT_MS,
			fn: () => activeProbeRedis.ping(),
		});

		return activeProbeRedis.status === "ready" && pong === "PONG";
	};

	const classifyPing = ({
		pingOk,
		activeProbeRedis,
	}: {
		pingOk: boolean;
		activeProbeRedis: Redis;
	}): ProbeOutcome => {
		if (pingOk) return "available";
		return activeProbeRedis.status === "ready"
			? "unresponsive_while_ready"
			: "connection_down";
	};

	const probeRedisAvailability = async (): Promise<ProbeOutcome> => {
		if (!hasConfig) return "connection_down";
		const activeProbeRedis = getOrCreateProbeRedis();

		let pingOk = false;
		try {
			pingOk = await pingRedisClient(activeProbeRedis);
		} catch {
			pingOk = false;
		}
		return classifyPing({ pingOk, activeProbeRedis });
	};

	const probeAndClassify = async (): Promise<ProbeClassification> => {
		loopLagSampler.begin();
		const outcome = await probeRedisAvailability();
		lastEventLoopLagMs = loopLagSampler.end();
		return classifyProbe({
			outcome,
			eventLoopLagMs: lastEventLoopLagMs,
			thresholdMs: REDIS_LOOP_LAG_INCONCLUSIVE_MS,
		});
	};

	const runTick = async () => {
		if (redisTickInFlight) return;
		redisTickInFlight = true;
		try {
			let classification = await probeAndClassify();

			if (classification === "inconclusive") {
				consecutiveInconclusive += 1;
				if (consecutiveInconclusive > maxConsecutiveInconclusive) {
					classification = "unavailable";
				} else {
					logInconclusiveProbe();
				}
			} else {
				consecutiveInconclusive = 0;
			}

			recordRedisAvailability(classification);
		} finally {
			redisTickInFlight = false;
		}
	};

	return {
		prime: async () => {
			if (!hasConfig) return;
			const mainRedis = getRedis();
			const activeProbeRedis = getOrCreateProbeRedis();
			const readinessPromises: Promise<void>[] = [];

			// Any non-ready status (wait/connecting/connect/reconnecting) means the
			// handshake is still in flight — probing now would misread boot as an outage.
			if (mainRedis.status !== "ready") {
				readinessPromises.push(
					waitForRedisReady(mainRedis, logPrefix).catch(() => undefined),
				);
			}
			if (activeProbeRedis !== mainRedis && activeProbeRedis.status !== "ready") {
				readinessPromises.push(
					waitForRedisReady(activeProbeRedis, `${logPrefix}Probe`).catch(
						() => undefined,
					),
				);
			}
			await Promise.all(readinessPromises);

			const classification = await probeAndClassify();
			consecutiveInconclusive = 0;

			if (classification === "unavailable") {
				consecutiveSuccesses = 0;
				consecutiveFailures = REDIS_FAILURES_TO_DEGRADE;
				setRedisAvailabilityState("degraded");
				return;
			}

			consecutiveSuccesses =
				classification === "available" ? REDIS_SUCCESSES_TO_RECOVER : 0;
			consecutiveFailures = 0;
			setRedisAvailabilityState("healthy");
		},
		startMonitor: () => {
			if (!hasConfig || redisMonitorInterval) return;

			void runTick();

			redisMonitorInterval = setInterval(() => {
				void runTick();
			}, REDIS_PROBE_INTERVAL_MS);
		},
		stopMonitor: () => {
			if (redisMonitorInterval) {
				clearInterval(redisMonitorInterval);
				redisMonitorInterval = null;
			}
			loopLagSampler.stop();
			if (probeRedis && probeRedis.status !== "end") {
				probeRedis.disconnect();
			}
		},
		shouldUseRedis: () =>
			hasConfig &&
			getRedis().status === "ready" &&
			redisAvailabilityState === "healthy",
		getRedisAvailability: (): RedisAvailabilitySnapshot => ({
			configured: hasConfig,
			state: redisAvailabilityState,
			status: getRedis().status,
		}),
		_runTickForTesting: () => runTick(),
	};
};
