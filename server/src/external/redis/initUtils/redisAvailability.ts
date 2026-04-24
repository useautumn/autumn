import { redis } from "./redisClientRegistry.js";
import {
	createRedisAvailability,
	type RedisAvailabilitySnapshot,
} from "./createRedisAvailability.js";

const redisAvailability = createRedisAvailability({
	redis,
	logPrefix: "Redis",
	logType: "redis_availability_state_set",
});

export const startRedisMonitor = redisAvailability.startMonitor;
export const stopRedisMonitor = redisAvailability.stopMonitor;
export const shouldUseRedis = redisAvailability.shouldUseRedis;
export const getRedisAvailability = redisAvailability.getRedisAvailability;

export type { RedisAvailabilitySnapshot };
