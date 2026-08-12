import "./initUtils/redisTypes.js";

export {
	getRedisAvailability,
	shouldUseRedis,
	startRedisMonitor,
	stopRedisMonitor,
} from "./availabilityMonitor/redisAvailability.js";
export {
	createPooledStandbyRedisConnection,
	createRedisClient,
	createRedisConnection,
	createStandbyRedisConnection,
} from "./initUtils/createRedisClient.js";
export {
	currentRegion,
	hasMiscRedisConfig,
} from "./initUtils/redisConfig.js";
export {
	waitForRedisReadPoolReady,
	waitForRedisReady,
	warmupRegionalRedis,
} from "./initUtils/redisWarmup.js";
export {
	getMiscRedis,
	getPrimaryRedis,
	getRegionalRedis,
} from "./miscCache/getMiscRedis.js";
export { getMiscBackupRedis } from "./miscCache/miscRedisInstances.js";
