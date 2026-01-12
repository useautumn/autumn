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
 * Sets a guard key to prevent stale writes from in-flight requests.
 * This ensures cache consistency and prevents race conditions where
 * a stale cache in another region could be read after deletion.
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

	const regions = getConfiguredRegions();

	try {
		const guardTimestamp = Date.now().toString();

		// Delete from all regions in parallel to avoid race conditions
		const deletePromises = regions.map(async (region) => {
			const regionalRedis = getRegionalRedis(region);

			// Check if this regional instance is ready
			if (regionalRedis.status !== "ready") {
				logger.warn(
					`[deleteCachedFullCustomer] Redis not ready for region ${region}, skipping`,
					{
						data: { status: regionalRedis.status, customerId, region },
					},
				);
				return { region, result: "SKIPPED_NOT_READY" as const };
			}

			const result = await regionalRedis.deleteFullCustomerCache(
				testGuardKey,
				guardKey,
				cacheKey,
				guardTimestamp,
				FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS.toString(),
			);

			return { region, result };
		});

		const results = await Promise.all(deletePromises);

		const deletedCount = results.filter((r) => r.result === "DELETED").length;
		const skippedCount = results.filter((r) => r.result === "SKIPPED").length;
		const regionsSummary = results
			.map((r) => `${r.region}: ${r.result}`)
			.join(", ");

		if (skippedCount > 0) {
			logger.info(
				`[deleteCachedFullCustomer] Test guard exists, skipped ${skippedCount} regions for ${customerId}`,
			);
		} else if (deletedCount > 0) {
			logger.info(
				`[deleteCachedFullCustomer] Deleted cache for ${customerId}, source: ${source}, regions: ${regionsSummary}`,
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
