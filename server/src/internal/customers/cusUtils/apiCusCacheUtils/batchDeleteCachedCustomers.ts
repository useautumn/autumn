import * as Sentry from "@sentry/bun";
import {
	getConfiguredRegions,
	getRegionalRedis,
	redis,
} from "@/external/redis/initRedis.js";
import { CACHE_CUSTOMER_VERSIONS } from "../../../../_luaScripts/cacheConfig";
import { batchDeleteCachedFullCustomers } from "../fullCustomerCacheUtils/batchDeleteCachedFullCustomers";

/**
 * Batch delete multiple customer caches in one Redis operation across ALL regions.
 * This ensures cache consistency and prevents race conditions where
 * a stale cache in another region could be read after deletion.
 * @param customers Array of {orgId, env, customerId} to delete
 * @returns Number of keys deleted
 */
export const batchDeleteCachedCustomers = async ({
	customers,
}: {
	customers: Array<{
		orgId: string;
		env: string;
		customerId: string;
	}>;
}): Promise<number> => {
	if (redis.status !== "ready") {
		console.warn("❗️ Redis not ready, skipping batch cache deletion", {
			status: redis.status,
			count: customers.length,
		});
		return 0;
	}

	if (customers.length === 0) {
		return 0;
	}

	// Group customers by orgId to avoid Redis Cluster hash slot errors
	// All keys in a Lua script must be in the same hash slot (same {orgId})
	const customersByOrg = new Map<string, typeof customers>();

	for (const customer of customers) {
		const key = customer.orgId;
		if (!customersByOrg.has(key)) {
			customersByOrg.set(key, []);
		}
		customersByOrg.get(key)?.push(customer);
	}

	const regions = getConfiguredRegions();

	try {
		await batchDeleteCachedFullCustomers({ customers });
		// Delete from all regions in parallel
		const regionPromises = regions.map(async (region) => {
			const regionalRedis = getRegionalRedis(region);

			if (regionalRedis.status !== "ready") {
				console.warn(
					`Redis not ready for region ${region}, skipping batch delete`,
				);
				return { region, deletedCount: 0, skipped: true };
			}

			// Use pipeline to batch all org deletions into one network round trip
			const pipeline = regionalRedis.pipeline();

			for (const orgCustomers of customersByOrg.values()) {
				pipeline.batchDeleteCustomers(
					CACHE_CUSTOMER_VERSIONS.LATEST,
					JSON.stringify(orgCustomers),
				);
			}

			const results = await pipeline.exec();

			// Sum up all deleted counts for this region
			let regionDeleted = 0;
			if (results) {
				for (const [error, result] of results) {
					if (error) {
						console.error(
							`Error in pipeline batch delete for region ${region}:`,
							error,
						);
						throw error;
					}
					regionDeleted += result as number;
				}
			}

			return { region, deletedCount: regionDeleted, skipped: false };
		});

		const regionResults = await Promise.all(regionPromises);

		const totalDeleted = regionResults.reduce(
			(sum, r) => sum + r.deletedCount,
			0,
		);
		const regionsSummary = regionResults
			.map((r) => `${r.region}: ${r.skipped ? "skipped" : r.deletedCount}`)
			.join(", ");

		console.log(
			`[batchDeleteCache] customers: ${customers.length}, keys: ${totalDeleted}, regions: ${regionsSummary}`,
		);

		return totalDeleted;
	} catch (error) {
		console.error("Error batch deleting customers:", error);
		Sentry.captureException(error);
		throw error;
	}
};
