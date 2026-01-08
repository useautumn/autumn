import { CACHE_CUSTOMER_VERSIONS } from "../../../../_luaScripts/cacheConfig.js";
import {
	type Logger,
	logger as loggerInstance,
} from "../../../../external/logtail/logtailUtils.js";
import { redis } from "../../../../external/redis/initRedis.js";

/**
 * Delete all cached ApiCustomer data from Redis
 * This includes the base customer key and all related feature/breakdown/rollover keys
 * Also deletes all associated entity caches atomically using Lua script
 */
export const deleteCachedApiCustomer = async ({
	customerId,
	orgId,
	env,
	source,
	logger,
}: {
	customerId: string;
	orgId: string;
	env: string;
	source?: string;
	logger?: Logger;
}): Promise<void> => {
	logger = loggerInstance || loggerInstance;

	if (redis.status !== "ready") {
		logger.warn("❗️ Redis not ready, skipping cache deletion", {
			data: {
				status: redis.status,
				customerId,
			},
		});
		return;
	}

	if (!customerId) return;

	try {
		const deletedCount = await redis.deleteCustomer(
			CACHE_CUSTOMER_VERSIONS.LATEST,
			orgId,
			env,
			customerId,
		);

		logger.info(
			`Deleted ${deletedCount} cache keys for customer ${customerId}, source: ${source}`,
		);
	} catch (error) {
		logger.error(`Error deleting customer with entities: ${error}`);
		throw error;
	}
};
