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

type RedisAvailabilityState = "healthy" | "degraded";

export type RedisAvailabilitySnapshot = {
	configured: boolean;
	state: RedisAvailabilityState;
	status: string;
};

export const createRedisAvailability = ({
	redis,
	hasConfig,
	logPrefix,
	logType,
}: {
	redis: Redis;
	hasConfig: boolean;
	logPrefix: string;
	logType: string;
}) => {
	let redisAvailabilityState: RedisAvailabilityState = "degraded";
	let redisMonitorInterval: ReturnType<typeof setInterval> | null = null;
	let redisTickInFlight = false;
	let lastAvailabilityLogAt = 0;
	let consecutiveFailures = 0;
	let consecutiveSuccesses = 0;
	let reconnectStartedAt: number | null = null;

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
				failuresToDegrade: REDIS_FAILURES_TO_DEGRADE,
				successesToRecover: REDIS_SUCCESSES_TO_RECOVER,
			},
		);
	};

	const recordRedisAvailability = (available: boolean) => {
		consecutiveSuccesses = available ? consecutiveSuccesses + 1 : 0;
		consecutiveFailures = available ? 0 : consecutiveFailures + 1;

		if (consecutiveSuccesses >= REDIS_SUCCESSES_TO_RECOVER)
			setRedisAvailabilityState("healthy");
		if (consecutiveFailures >= REDIS_FAILURES_TO_DEGRADE)
			setRedisAvailabilityState("degraded");
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

	const probeRedisAvailability = async (): Promise<boolean> => {
		if (!hasConfig) return false;

		let failedWhileReady = false;
		try {
			if (await pingRedisClient()) {
				return true;
			}
			failedWhileReady = redis.status === "ready";
		} catch {
			failedWhileReady = redis.status === "ready";
		}

		const shouldReconnectReadyClient =
			failedWhileReady &&
			consecutiveFailures + 1 >= REDIS_FAILURES_TO_DEGRADE;

		if (shouldReconnectReadyClient) {
			await reconnectRedis();
		} else if (redis.status !== "ready") {
			if (
				redis.status === "connecting" ||
				redis.status === "reconnecting"
			) {
				reconnectStartedAt ??= Date.now();
				if (Date.now() - reconnectStartedAt < REDIS_STALE_RECONNECT_MS) {
					return false;
				}
			}

			await reconnectRedis();
		}

		return await pingRedisClient().catch(() => false);
	};

	const runTick = async () => {
		if (redisTickInFlight) return;
		redisTickInFlight = true;
		try {
			recordRedisAvailability(await probeRedisAvailability());
		} finally {
			redisTickInFlight = false;
		}
	};

	return {
		prime: async () => {
			if (!hasConfig) return;
			if (
				redis.status === "connecting" ||
				redis.status === "reconnecting"
			) {
				await waitForRedisReady(redis, logPrefix).catch(() => undefined);
			}
			const available = await probeRedisAvailability();
			consecutiveSuccesses = available ? REDIS_SUCCESSES_TO_RECOVER : 0;
			consecutiveFailures = available ? 0 : REDIS_FAILURES_TO_DEGRADE;
			setRedisAvailabilityState(available ? "healthy" : "degraded");
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
		shouldUseRedis: () =>
			hasConfig && redisAvailabilityState === "healthy",
		getRedisAvailability: (): RedisAvailabilitySnapshot => ({
			configured: hasConfig,
			state: redisAvailabilityState,
			status: redis.status,
		}),
	};
};
