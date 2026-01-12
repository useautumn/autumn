import {
	getConfiguredRegions,
	getRegionalRedis,
	redis,
} from "@/external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import {
	buildFullCustomerCacheGuardKey,
	buildFullCustomerCacheKey,
	FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS,
} from "./fullCustomerCacheConfig.js";
import { buildTestFullCustomerCacheGuardKey } from "./testFullCustomerCacheGuard.js";

/**
 * Delete FullCustomer from Redis cache across ALL regions.
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

	if (redis.status !== "ready" || !customerId) return;

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

	const regions = getConfiguredRegions();
	const guardTimestamp = Date.now().toString();

	// Delete from all regions in parallel
	const deletePromises = regions.map(async (region) => {
		try {
			const regionalRedis = getRegionalRedis(region);

			if (regionalRedis.status !== "ready") {
				logger.warn(`[deleteCachedFullCustomer] ${region}: not_ready`);
				return;
			}

			const result = await regionalRedis.deleteFullCustomerCache(
				testGuardKey,
				guardKey,
				cacheKey,
				guardTimestamp,
				FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS.toString(),
			);

			logger.info(
				`[deleteCachedFullCustomer] ${region}: ${result}, customer: ${customerId}, source: ${source}`,
			);
		} catch (error) {
			logger.error(
				`[deleteCachedFullCustomer] ${region}: error, customer: ${customerId}, source: ${source}, error: ${error}`,
			);
		}
	});

	await Promise.all(deletePromises);
};
