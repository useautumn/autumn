import { redis } from "./redisClientRegistry.js";
import {
	createRedisAvailability,
	type RedisAvailabilitySnapshot,
} from "./createRedisAvailability.js";
import { hasRedisConfig } from "./redisConfig.js";

const redisAvailability = createRedisAvailability({
	redis,
	hasConfig: hasRedisConfig,
	logPrefix: "Redis",
	logType: "redis_availability_state_set",
});

export const startRedisMonitor = redisAvailability.startMonitor;
export const stopRedisMonitor = redisAvailability.stopMonitor;
export const primeRedisMonitor = redisAvailability.prime;
export const shouldUseRedis = redisAvailability.shouldUseRedis;
export const getRedisAvailability = redisAvailability.getRedisAvailability;

export type { RedisAvailabilitySnapshot };
