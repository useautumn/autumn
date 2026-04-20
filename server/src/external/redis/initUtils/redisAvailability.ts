import { withTimeout } from "@/utils/withTimeout.js";
import { redis } from "./redisClientRegistry.js";
import { hasRedisConfig } from "./redisConfig.js";

const REDIS_ERROR_LOG_INTERVAL_MS = 30_000;
const REDIS_PROBE_INTERVAL_MS = 2_000;
const REDIS_PROBE_TIMEOUT_MS = 500;

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

const setRedisAvailabilityState = (state: RedisAvailabilityState) => {
	if (redisAvailabilityState === state) return;

	redisAvailabilityState = state;

	const now = Date.now();
	if (now - lastAvailabilityLogAt < REDIS_ERROR_LOG_INTERVAL_MS) return;
	lastAvailabilityLogAt = now;

	console[state === "healthy" ? "info" : "warn"](
		state === "healthy"
			? "[Redis] Recovered"
			: "[Redis] Unavailable, skipping Redis-backed features",
	);
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
			setRedisAvailabilityState("healthy");
			return;
		}
	} catch {}

	await tryReconnectRedis();
	setRedisAvailabilityState(
		(await pingRedisClient().catch(() => false)) ? "healthy" : "degraded",
	);
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

export const getRedisAvailability = (): RedisAvailabilitySnapshot => ({
	configured: hasRedisConfig,
	state: redisAvailabilityState,
	status: redis.status,
});
