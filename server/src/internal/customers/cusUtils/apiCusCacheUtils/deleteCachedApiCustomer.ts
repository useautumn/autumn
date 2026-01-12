import { CACHE_CUSTOMER_VERSIONS } from "../../../../_luaScripts/cacheConfig.js";
import {
	getConfiguredRegions,
	getRegionalRedis,
	redis,
} from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "../fullCustomerCacheUtils/deleteCachedFullCustomer.js";

/**
 * Delete all cached ApiCustomer data from Redis across ALL regions.
 * This ensures cache consistency and prevents race conditions where
 * a stale cache in another region could be read after deletion.
 */
export const deleteCachedApiCustomer = async ({
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
		logger.warn("❗️ Redis not ready, skipping cache deletion", {
			data: {
				status: redis.status,
				customerId,
			},
		});
		return;
	}

	if (!customerId) return;

	const regions = getConfiguredRegions();

	try {
		await deleteCachedFullCustomer({ ctx, customerId, source });
		// Delete from all regions in parallel to avoid race conditions
		const deletePromises = regions.map(async (region) => {
			const regionalRedis = getRegionalRedis(region);

			// Check if this regional instance is ready
			if (regionalRedis.status !== "ready") {
				logger?.warn(`Redis not ready for region ${region}, skipping`, {
					data: { status: regionalRedis.status, customerId, region },
				});
				return { region, deletedCount: 0, skipped: true };
			}

			const deletedCount = await regionalRedis.deleteCustomer(
				CACHE_CUSTOMER_VERSIONS.LATEST,
				org.id,
				env,
				customerId,
			);

			return { region, deletedCount, skipped: false };
		});

		const results = await Promise.all(deletePromises);

		const totalDeleted = results.reduce(
			(sum, r) => sum + (r.deletedCount || 0),
			0,
		);
		const regionsSummary = results
			.map((r) => `${r.region}: ${r.skipped ? "skipped" : r.deletedCount}`)
			.join(", ");

		logger.info(
			`Deleted cache keys for customer ${customerId}. Source: ${source}, keys: ${totalDeleted}, regions: ${regions.length} (${regionsSummary})`,
		);
	} catch (error) {
		logger.error(`Error deleting customer with entities: ${error}`);
		throw error;
	}
};
