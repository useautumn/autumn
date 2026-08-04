import { redisV2 } from "../initRedisV2.js";
import {
	createRedisAvailability,
	type RedisAvailabilitySnapshot,
} from "./createRedisAvailability.js";

const redisV2Availability = createRedisAvailability({
	getRedis: () => redisV2,
	hasConfig: true,
	logPrefix: "RedisV2",
	logType: "redis_v2_availability_state_set",
});

const {
	prime: primeRedisV2Monitor,
	startMonitor: startRedisV2Monitor,
	stopMonitor: stopRedisV2Monitor,
	shouldUseRedis: shouldUseRedisV2,
	getRedisAvailability: getRedisV2Availability,
} = redisV2Availability;

export type { RedisAvailabilitySnapshot };
export {
	getRedisV2Availability,
	primeRedisV2Monitor,
	shouldUseRedisV2,
	startRedisV2Monitor,
	stopRedisV2Monitor,
};
