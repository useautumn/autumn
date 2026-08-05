import "./initUtils/redisTypes.js";

export {
	createRedisClient,
	createRedisConnection,
	createStandbyRedisConnection,
} from "./initUtils/createRedisClient.js";
export {
	getRedisAvailability,
	shouldUseRedis,
	startRedisMonitor,
	stopRedisMonitor,
} from "./availabilityMonitor/redisAvailability.js";
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
} from "./miscCache/getMiscRedis.js";
export { getMiscBackupRedis } from "./miscCache/miscRedisInstances.js";
