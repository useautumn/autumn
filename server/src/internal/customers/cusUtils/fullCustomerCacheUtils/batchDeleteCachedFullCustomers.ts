import {
	type Logger,
	logger as loggerInstance,
} from "@/external/logtail/logtailUtils.js";
import {
	getConfiguredRegions,
	getRegionalRedis,
	redis,
} from "@/external/redis/initRedis.js";
import {
	buildFullCustomerCacheGuardKey,
	buildFullCustomerCacheKey,
	FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS,
} from "./fullCustomerCacheConfig.js";
import { buildTestFullCustomerCacheGuardKey } from "./testFullCustomerCacheGuard.js";

type CustomerToDelete = {
	orgId: string;
	env: string;
	customerId: string;
};

/**
 * Batch delete multiple FullCustomer caches across ALL regions.
 * Groups by orgId to ensure all keys in each batch are on the same Redis Cluster node.
 * Sets guard keys to prevent stale writes from in-flight requests.
 * This ensures cache consistency and prevents race conditions where
 * a stale cache in another region could be read after deletion.
 */
export const batchDeleteCachedFullCustomers = async ({
	customers,
	source,
	logger,
}: {
	customers: CustomerToDelete[];
	source?: string;
	logger?: Logger;
}): Promise<number> => {
	const log = logger || loggerInstance;

	if (redis.status !== "ready") {
		log.warn(
			`[batchDeleteCachedFullCustomers] Redis not ready, skipping deletion for ${customers.length} customers`,
		);
		return 0;
	}

	if (customers.length === 0) {
		return 0;
	}

	// Group customers by orgId to ensure all keys hash to the same Redis Cluster slot
	const customersByOrg = new Map<string, CustomerToDelete[]>();
	for (const customer of customers) {
		const existing = customersByOrg.get(customer.orgId) || [];
		existing.push(customer);
		customersByOrg.set(customer.orgId, existing);
	}

	const regions = getConfiguredRegions();

	try {
		const guardTimestamp = Date.now().toString();

		// Build customers data once (shared across all regions)
		const customersDataByOrg = new Map<string, object[]>();
		for (const [orgId, orgCustomers] of customersByOrg) {
			const customersData = orgCustomers.map(({ env, customerId }) => ({
				testGuardKey: buildTestFullCustomerCacheGuardKey({
					orgId,
					env,
					customerId,
				}),
				guardKey: buildFullCustomerCacheGuardKey({ orgId, env, customerId }),
				cacheKey: buildFullCustomerCacheKey({ orgId, env, customerId }),
			}));
			customersDataByOrg.set(orgId, customersData);
		}

		// Delete from all regions in parallel
		const regionPromises = regions.map(async (region) => {
			const regionalRedis = getRegionalRedis(region);

			if (regionalRedis.status !== "ready") {
				log.warn(
					`[batchDeleteCachedFullCustomers] Redis not ready for region ${region}, skipping`,
				);
				return { region, deleted: 0, skipped: 0, notReady: true };
			}

			// Use pipeline to batch all org deletions into one network round trip
			const pipeline = regionalRedis.pipeline();

			for (const customersData of customersDataByOrg.values()) {
				pipeline.batchDeleteFullCustomerCache(
					guardTimestamp,
					FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS.toString(),
					JSON.stringify(customersData),
				);
			}

			const results = await pipeline.exec();

			// Sum up results from all orgs for this region
			let regionDeleted = 0;
			let regionSkipped = 0;

			if (results) {
				for (const [error, resultJson] of results) {
					if (error) {
						log.error(
							`[batchDeleteCachedFullCustomers] Pipeline error for region ${region}: ${error}`,
						);
						throw error;
					}
					const result = JSON.parse(resultJson as string) as {
						deleted: number;
						skipped: number;
					};
					regionDeleted += result.deleted;
					regionSkipped += result.skipped;
				}
			}

			return {
				region,
				deleted: regionDeleted,
				skipped: regionSkipped,
				notReady: false,
			};
		});

		const regionResults = await Promise.all(regionPromises);

		// Sum up results from all regions
		const totalDeleted = regionResults.reduce((sum, r) => sum + r.deleted, 0);
		const totalSkipped = regionResults.reduce((sum, r) => sum + r.skipped, 0);
		const regionsSummary = regionResults
			.map(
				(r) =>
					`${r.region}: ${r.notReady ? "not_ready" : `del=${r.deleted},skip=${r.skipped}`}`,
			)
			.join(", ");

		if (totalSkipped > 0) {
			log.info(
				`[batchDeleteCachedFullCustomers] Skipped ${totalSkipped} customers (test guard), deleted ${totalDeleted}, source: ${source}, regions: ${regionsSummary}`,
			);
		} else {
			log.info(
				`[batchDeleteCachedFullCustomers] Deleted ${totalDeleted} keys for ${customers.length} customers across ${customersByOrg.size} orgs, source: ${source}, regions: ${regionsSummary}`,
			);
		}

		return totalDeleted;
	} catch (error) {
		log.error(`[batchDeleteCachedFullCustomers] Error: ${error}`);
		throw error;
	}
};
