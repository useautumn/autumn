import { hasMiscRedisConfig } from "../initUtils/redisConfig.js";
import { getMiscRedis } from "../miscCache/getMiscRedis.js";
import {
	createRedisAvailability,
	type RedisAvailabilitySnapshot,
} from "./createRedisAvailability.js";

const redisAvailability = createRedisAvailability({
	getRedis: getMiscRedis,
	hasConfig: hasMiscRedisConfig,
	logPrefix: "Redis",
	logType: "redis_availability_state_set",
});

export const startRedisMonitor = redisAvailability.startMonitor;
export const stopRedisMonitor = redisAvailability.stopMonitor;
export const primeRedisMonitor = redisAvailability.prime;
export const shouldUseRedis = redisAvailability.shouldUseRedis;
export const getRedisAvailability = redisAvailability.getRedisAvailability;

export type { RedisAvailabilitySnapshot };
