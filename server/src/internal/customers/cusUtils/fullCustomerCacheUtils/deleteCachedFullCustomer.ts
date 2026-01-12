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
import { buildTestFullCustomerCacheGuardKey } from "./testFullCustomerCacheGuard.js";

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

	const testGuardKey = buildTestFullCustomerCacheGuardKey({
		orgId,
		env,
		customerId,
	});
	const cacheKey = buildFullCustomerCacheKey({ orgId, env, customerId });
	const guardKey = buildFullCustomerCacheGuardKey({ orgId, env, customerId });

	try {
		const guardTimestamp = Date.now().toString();

		const result = await redis.deleteFullCustomerCache(
			testGuardKey,
			guardKey,
			cacheKey,
			guardTimestamp,
			FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS.toString(),
		);

		if (result === "SKIPPED") {
			log.info(
				`[deleteCachedFullCustomer] Test guard exists, skipping deletion for ${customerId}`,
			);
		} else if (result === "DELETED") {
			log.info(
				`[deleteCachedFullCustomer] Deleted cache for ${customerId}, source: ${source}`,
			);
		} else {
			log.debug(
				`[deleteCachedFullCustomer] Cache key didn't exist for ${customerId}, source: ${source}`,
			);
		}
	} catch (error) {
		log.error(`[deleteCachedFullCustomer] Error: ${error}`);
		throw error;
	}
};
