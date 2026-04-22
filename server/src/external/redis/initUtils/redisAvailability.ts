import { logger } from "@/external/logtail/logtailUtils.js";
import { withTimeout } from "@/utils/withTimeout.js";
import { redis } from "./redisClientRegistry.js";
import { hasRedisConfig } from "./redisConfig.js";

const REDIS_ERROR_LOG_INTERVAL_MS = 30_000;
const REDIS_PROBE_INTERVAL_MS = 2_000;
const REDIS_PROBE_TIMEOUT_MS = 1_000;
const REDIS_FAILURES_TO_DEGRADE = 3;
const REDIS_SUCCESSES_TO_RECOVER = 2;

type RedisAvailabilityState = "healthy" | "degraded";

export type RedisAvailabilitySnapshot = {
	configured: boolean;
	state: RedisAvailabilityState;
	status: string;
};

let redisAvailabilityState: RedisAvailabilityState = "degraded";
let redisMonitorInterval: ReturnType<typeof setInterval> | null = null;
let redisTickInFlight = false;
let lastAvailabilityLogAt = 0;
let consecutiveFailures = 0;
let consecutiveSuccesses = 0;

const setRedisAvailabilityState = (state: RedisAvailabilityState) => {
	const previousState = redisAvailabilityState;
	const shouldLog =
		previousState !== state ||
		(state === "degraded" &&
			Date.now() - lastAvailabilityLogAt >= REDIS_ERROR_LOG_INTERVAL_MS);
	if (!shouldLog) return;

	redisAvailabilityState = state;

	const now = Date.now();
	if (now - lastAvailabilityLogAt < REDIS_ERROR_LOG_INTERVAL_MS) return;
	lastAvailabilityLogAt = now;

	logger[state === "healthy" ? "info" : "warn"](
		state === "healthy"
			? "[Redis] Recovered"
			: "[Redis] Unavailable, skipping Redis-backed features",
		{
			type: "redis_availability_state_set",
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
	if (redis.status !== "ready") {
		return false;
	}

	const pong = await withTimeout({
		timeoutMs: REDIS_PROBE_TIMEOUT_MS,
		fn: () => redis.ping(),
	});

	return redis.status === "ready" && pong === "PONG";
};

const tryReconnectRedis = async () => {
	if (!hasRedisConfig || redis.status === "ready" || redis.status === "connecting")
		return;

	try {
		redis.disconnect(false);
		await redis.connect();
	} catch {
		// Let the next probe decide whether we recovered.
	}
};

const tickRedisAvailability = async () => {
	if (!hasRedisConfig) return;

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

export const startRedisMonitor = () => {
	if (redisMonitorInterval) return;

	void tickRedisAvailability();

	redisMonitorInterval = setInterval(async () => {
		if (redisTickInFlight) return;
		redisTickInFlight = true;
		try {
			await tickRedisAvailability();
		} finally {
			redisTickInFlight = false;
		}
	}, REDIS_PROBE_INTERVAL_MS);
};

export const stopRedisMonitor = () => {
	if (!redisMonitorInterval) return;
	clearInterval(redisMonitorInterval);
	redisMonitorInterval = null;
};

export const shouldUseRedis = () =>
	hasRedisConfig && redisAvailabilityState === "healthy";

export const markRedisCommandSuccess = () => {
	if (hasRedisConfig) recordRedisAvailability(true);
};

export const markRedisCommandFailure = () => {
	if (hasRedisConfig) recordRedisAvailability(false);
};

export const getRedisAvailability = (): RedisAvailabilitySnapshot => ({
	configured: hasRedisConfig,
	state: redisAvailabilityState,
	status: redis.status,
});
