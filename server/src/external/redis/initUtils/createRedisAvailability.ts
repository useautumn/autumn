import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import { withTimeout } from "@/utils/withTimeout.js";
import { waitForRedisReady } from "./redisWarmup.js";

const REDIS_ERROR_LOG_INTERVAL_MS = 30_000;
const REDIS_PROBE_INTERVAL_MS = 2_000;
const REDIS_PROBE_TIMEOUT_MS = 1_000;
const REDIS_STALE_RECONNECT_MS = 5_000;
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
	redis,
	hasConfig,
	logPrefix,
	logType,
	getEventLoopLagMs,
	maxConsecutiveInconclusive = REDIS_MAX_CONSECUTIVE_INCONCLUSIVE,
}: {
	redis: Redis;
	hasConfig: boolean;
	logPrefix: string;
	logType: string;
	getEventLoopLagMs?: () => number;
	maxConsecutiveInconclusive?: number;
}) => {
	let redisAvailabilityState: RedisAvailabilityState = "degraded";
	let redisMonitorInterval: ReturnType<typeof setInterval> | null = null;
	let redisTickInFlight = false;
	let lastAvailabilityLogAt = 0;
	let lastInconclusiveLogAt = 0;
	let consecutiveFailures = 0;
	let consecutiveSuccesses = 0;
	let consecutiveInconclusive = 0;
	let reconnectStartedAt: number | null = null;
	let lastEventLoopLagMs = 0;

	const loopLagSampler = ((): { begin: () => void; end: () => number } => {
		if (getEventLoopLagMs) {
			return { begin: () => {}, end: () => getEventLoopLagMs() };
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
			return { begin: () => {}, end: () => 0 };
		}

		const activeHistogram = histogram;
		return {
			begin: () => activeHistogram.reset(),
			end: () => {
				const maxMs = histogramMaxToMs(activeHistogram.max);
				return Number.isFinite(maxMs) && maxMs > 0 ? maxMs : 0;
			},
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

		logger[state === "healthy" ? "info" : "warn"](
			state === "healthy"
				? `[${logPrefix}] Recovered`
				: `[${logPrefix}] Unavailable, skipping Redis-backed features`,
			{
				type: logType,
				previousState,
				state,
				redisStatus: redis.status,
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
			redisStatus: redis.status,
			consecutiveFailures,
			eventLoopLagMs: lastEventLoopLagMs,
			loopLagThresholdMs: REDIS_LOOP_LAG_INCONCLUSIVE_MS,
		});
	};

	const pingRedisClient = async () => {
		if (redis.status !== "ready") return false;

		const pong = await withTimeout({
			timeoutMs: REDIS_PROBE_TIMEOUT_MS,
			fn: () => redis.ping(),
		});

		return redis.status === "ready" && pong === "PONG";
	};

	const reconnectRedis = async () => {
		try {
			redis.disconnect(false);
			await withTimeout({
				timeoutMs: REDIS_PROBE_TIMEOUT_MS,
				fn: () => redis.connect(),
			});
			reconnectStartedAt = null;
		} catch {
			// Let the next probe decide whether we recovered.
		}
	};

	const classifyPing = (pingOk: boolean): ProbeOutcome => {
		if (pingOk) return "available";
		return redis.status === "ready"
			? "unresponsive_while_ready"
			: "connection_down";
	};

	const probeRedisAvailability = async (): Promise<ProbeOutcome> => {
		if (!hasConfig) return "connection_down";

		let pingOk = false;
		try {
			pingOk = await pingRedisClient();
		} catch {
			pingOk = false;
		}
		if (pingOk) return "available";

		const failedWhileReady = redis.status === "ready";
		const shouldReconnectReadyClient =
			failedWhileReady && consecutiveFailures + 1 >= REDIS_FAILURES_TO_DEGRADE;

		if (shouldReconnectReadyClient) {
			await reconnectRedis();
		} else if (redis.status !== "ready") {
			if (redis.status === "connecting" || redis.status === "reconnecting") {
				reconnectStartedAt ??= Date.now();
				if (Date.now() - reconnectStartedAt < REDIS_STALE_RECONNECT_MS) {
					return "connection_down";
				}
			}

			await reconnectRedis();
		}

		return classifyPing(await pingRedisClient().catch(() => false));
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
			if (redis.status === "connecting" || redis.status === "reconnecting") {
				await waitForRedisReady(redis, logPrefix).catch(() => undefined);
			}

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
			if (!redisMonitorInterval) return;
			clearInterval(redisMonitorInterval);
			redisMonitorInterval = null;
		},
		shouldUseRedis: () => hasConfig && redisAvailabilityState === "healthy",
		getRedisAvailability: (): RedisAvailabilitySnapshot => ({
			configured: hasConfig,
			state: redisAvailabilityState,
			status: redis.status,
		}),
		_runTickForTesting: () => runTick(),
	};
};
