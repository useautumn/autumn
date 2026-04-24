import {
	hasRedisV2Config,
	redisV2,
} from "../initRedisV2.js";
import {
	createRedisAvailability,
	type RedisAvailabilitySnapshot,
} from "./createRedisAvailability.js";
import {
	getRedisAvailability,
	shouldUseRedis,
} from "./redisAvailability.js";
import { redis as primaryRedis } from "./redisClientRegistry.js";

const usesPrimaryRedis = redisV2 === primaryRedis;
const noop = () => {};
const getPrimaryBackedRedisV2Availability = (): RedisAvailabilitySnapshot => {
	const availability = getRedisAvailability();

	return {
		configured: hasRedisV2Config,
		state: availability.state,
		status: availability.status,
	};
};

const redisV2Availability = usesPrimaryRedis
	? {
			startMonitor: noop,
			stopMonitor: noop,
			shouldUseRedis,
			getRedisAvailability: getPrimaryBackedRedisV2Availability,
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
	getRedisAvailability: getRedisV2Availability,
} = redisV2Availability;

export {
	getRedisV2Availability,
	startRedisV2Monitor,
	stopRedisV2Monitor,
	shouldUseRedisV2,
};
