import {
	type Logger,
	logger as loggerInstance,
} from "@/external/logtail/logtailUtils.js";
import { redis } from "@/external/redis/initRedis.js";
import {
	buildFullCustomerCacheGuardKey,
	buildFullCustomerCacheKey,
	FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS,
} from "./fullCustomerCacheConfig.js";

/**
 * Delete FullCustomer from Redis cache
 * Sets a guard key to prevent stale writes from in-flight requests
 */
export const deleteCachedFullCustomer = async ({
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
	const log = logger || loggerInstance;

	if (redis.status !== "ready") {
		log.warn(
			`[deleteCachedFullCustomer] Redis not ready, skipping deletion for ${customerId}`,
		);
		return;
	}

	if (!customerId) return;

	const cacheKey = buildFullCustomerCacheKey({ orgId, env, customerId });
	const guardKey = buildFullCustomerCacheGuardKey({ orgId, env, customerId });

	try {
		// Set guard key with current timestamp (prevents stale writes)
		const guardTimestamp = Date.now().toString();
		await redis.set(
			guardKey,
			guardTimestamp,
			"EX",
			FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS,
		);

		// Delete the cache key
		const deletedCount = await redis.del(cacheKey);

		log.info(
			`[deleteCachedFullCustomer] Deleted ${deletedCount} keys for ${customerId}, source: ${source}`,
		);
	} catch (error) {
		log.error(`[deleteCachedFullCustomer] Error: ${error}`);
		throw error;
	}
};
