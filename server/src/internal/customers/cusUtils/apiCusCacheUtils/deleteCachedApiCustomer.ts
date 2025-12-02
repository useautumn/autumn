import { logger } from "../../../../external/logtail/logtailUtils.js";
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
}: {
	customerId: string;
	orgId: string;
	env: string;
	source?: string;
}): Promise<void> => {
	if (redis.status !== "ready") {
		console.warn("❗️ Redis not ready, skipping cache deletion", {
			status: redis.status,
			customerId,
		});
		return;
	}

	if (!customerId) return;

	try {
		const deletedCount = await redis.deleteCustomer(orgId, env, customerId);

		logger.info(
			`Deleted ${deletedCount} cache keys for customer ${customerId}, source: ${source}`,
		);
	} catch (error) {
		console.error("Error deleting customer with entities:", error);
		throw error;
	}
};
