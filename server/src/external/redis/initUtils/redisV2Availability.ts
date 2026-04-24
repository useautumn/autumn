import { redisV2 as redis } from "../initRedisV2.js";
import { createRedisAvailability } from "./createRedisAvailability.js";

const redisV2Availability = createRedisAvailability({
	redis,
	logPrefix: "RedisV2",
	logType: "redis_v2_availability_state_set",
});

export const startRedisV2Monitor = redisV2Availability.startMonitor;
export const stopRedisV2Monitor = redisV2Availability.stopMonitor;
export const shouldUseRedisV2 = redisV2Availability.shouldUseRedis;
