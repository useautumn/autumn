import {
	hasRedisV2Config,
	redisV2,
} from "../initRedisV2.js";
import { createRedisAvailability } from "./createRedisAvailability.js";
import { shouldUseRedis } from "./redisAvailability.js";
import { redis as primaryRedis } from "./redisClientRegistry.js";

const usesPrimaryRedis = redisV2 === primaryRedis;
const noop = () => {};
const redisV2Availability = usesPrimaryRedis
	? {
			startMonitor: noop,
			stopMonitor: noop,
			shouldUseRedis,
		}
	: createRedisAvailability({
			redis: redisV2,
			hasConfig: hasRedisV2Config,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
		});

const {
	startMonitor: startRedisV2Monitor,
	stopMonitor: stopRedisV2Monitor,
	shouldUseRedis: shouldUseRedisV2,
} = redisV2Availability;

export { startRedisV2Monitor, stopRedisV2Monitor, shouldUseRedisV2 };
