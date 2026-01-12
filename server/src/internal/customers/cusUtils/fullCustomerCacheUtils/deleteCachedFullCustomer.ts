import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
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
	ctx,
	source,
}: {
	customerId: string;
	ctx: AutumnContext;
	source?: string;
}): Promise<void> => {
	const { org, env, logger } = ctx;

	if (redis.status !== "ready") {
		logger.warn(
			`[deleteCachedFullCustomer] Redis not ready, skipping deletion for ${customerId}`,
		);
		return;
	}

	if (!customerId) return;

	const testGuardKey = buildTestFullCustomerCacheGuardKey({
		orgId: org.id,
		env,
		customerId,
	});
	const cacheKey = buildFullCustomerCacheKey({
		orgId: org.id,
		env,
		customerId,
	});
	const guardKey = buildFullCustomerCacheGuardKey({
		orgId: org.id,
		env,
		customerId,
	});

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
			logger.info(
				`[deleteCachedFullCustomer] Test guard exists, skipping deletion for ${customerId}`,
			);
		} else if (result === "DELETED") {
			logger.info(
				`[deleteCachedFullCustomer] Deleted cache for ${customerId}, source: ${source}`,
			);
		} else {
			logger.debug(
				`[deleteCachedFullCustomer] Cache key didn't exist for ${customerId}, source: ${source}`,
			);
		}
	} catch (error) {
		logger.error(`[deleteCachedFullCustomer] Error: ${error}`);
		throw error;
	}
};
