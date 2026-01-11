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
		// Set guard key and delete cache key in one round trip
		const guardTimestamp = Date.now().toString();
		const results = await redis
			.pipeline()
			.set(
				guardKey,
				guardTimestamp,
				"EX",
				FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS,
			)
			.del(cacheKey)
			.exec();

		const deletedCount = results?.[1]?.[1] ?? 0;

		log.info(
			`[deleteCachedFullCustomer] Deleted ${deletedCount} keys for ${customerId}, source: ${source}`,
		);
	} catch (error) {
		log.error(`[deleteCachedFullCustomer] Error: ${error}`);
		throw error;
	}
};
