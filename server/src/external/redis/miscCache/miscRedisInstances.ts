import {
	configureCache,
	getMiscBackupRedis,
	getMiscMainRedis,
} from "@autumn/cache";
import type { AutumnLogger } from "@autumn/logging";
import { resolvePrivateOrPublicUrl } from "@/external/aws/ecs/resolvePrivateOrPublicUrl.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import "@/internal/misc/miscRedisConfig/miscRedisConfigStore.js";
import { decryptData } from "@/utils/encryptUtils.js";
import { createRedisClient } from "../initUtils/createRedisClient.js";
import { currentRegion, resolveMiscMainUrl } from "../initUtils/redisConfig.js";

const configuration = {
	createRedisClient,
	decryptConnectionString: decryptData,
	resolveMainRedisUrl: resolveMiscMainUrl,
	resolvePrivateOrPublicUrl,
	region: currentRegion,
	logger: logger as AutumnLogger,
};

configureCache({ configuration });

export { getMiscBackupRedis, getMiscMainRedis };
