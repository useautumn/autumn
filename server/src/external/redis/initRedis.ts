import "./initUtils/redisTypes.js";

export {
	getRedisAvailability,
	shouldUseRedis,
	startRedisMonitor,
	stopRedisMonitor,
} from "./availabilityMonitor/redisAvailability.js";
export {
	createRedisClient,
	createRedisConnection,
} from "./initUtils/createRedisClient.js";
export {
	currentRegion,
	hasMiscRedisConfig,
} from "./initUtils/redisConfig.js";
export {
	waitForRedisReady,
	warmupRegionalRedis,
} from "./initUtils/redisWarmup.js";
export {
	getMiscRedis,
	getPrimaryRedis,
	getRegionalRedis,
	miscRedis,
	redis,
} from "./miscCache/getMiscRedis.js";
export { getMiscBackupRedis } from "./miscCache/miscRedisInstances.js";
