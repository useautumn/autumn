import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import { withTimeout } from "@/utils/withTimeout.js";

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

	const tryReconnectRedis = async () => {
		if (!hasConfig || redis.status === "ready") {
			reconnectStartedAt = null;
			return;
		}

		if (
			redis.status === "connecting" ||
			redis.status === "reconnecting"
		) {
			reconnectStartedAt ??= Date.now();
			if (Date.now() - reconnectStartedAt < REDIS_STALE_RECONNECT_MS) return;
		}

		try {
			redis.disconnect(false);
			await withTimeout({
				timeoutMs: REDIS_PROBE_TIMEOUT_MS,
				fn: () => redis.connect(),
			});
		} catch {
			// Let the next probe decide whether we recovered.
		}
	};

	const tickRedisAvailability = async () => {
		if (!hasConfig) return;

		try {
			if (await pingRedisClient()) {
				recordRedisAvailability(true);
				return;
			}
		} catch {}

		await tryReconnectRedis();
		(await pingRedisClient().catch(() => false))
			? recordRedisAvailability(true)
			: recordRedisAvailability(false);
	};

	const runTick = async () => {
		if (redisTickInFlight) return;
		redisTickInFlight = true;
		try {
			await tickRedisAvailability();
		} finally {
			redisTickInFlight = false;
		}
	};

	return {
		startMonitor: () => {
			if (redisMonitorInterval) return;

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
