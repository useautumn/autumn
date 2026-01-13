import {
	type Logger,
	logger as loggerInstance,
} from "@/external/logtail/logtailUtils.js";
import {
	getConfiguredRegions,
	getRegionalRedis,
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
 */
export const batchDeleteCachedFullCustomers = async ({
	customers,
	logger,
}: {
	customers: CustomerToDelete[];
	logger?: Logger;
}): Promise<number> => {
	const log = logger || loggerInstance;

	if (customers.length === 0) return 0;

	// Group customers by orgId for Redis Cluster slot consistency
	const customersByOrg = new Map<string, CustomerToDelete[]>();
	for (const customer of customers) {
		const existing = customersByOrg.get(customer.orgId) || [];
		existing.push(customer);
		customersByOrg.set(customer.orgId, existing);
	}

	const regions = getConfiguredRegions();
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
			console.warn(`[batchDeleteCachedFullCustomers] ${region}: not_ready`);
			return 0;
		}

		const pipeline = regionalRedis.pipeline();
		for (const customersData of customersDataByOrg.values()) {
			pipeline.batchDeleteFullCustomerCache(
				guardTimestamp,
				FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS.toString(),
				JSON.stringify(customersData),
			);
		}

		const results = await pipeline.exec();
		let deleted = 0;

		if (results) {
			for (const [error, resultJson] of results) {
				if (error) throw error;
				const result = JSON.parse(resultJson as string) as { deleted: number };
				deleted += result.deleted;
			}
		}

		console.info(
			`[batchDeleteCachedFullCustomers] ${region}: deleted ${deleted} keys, customers (${customers.length}), orgs (${customersByOrg.size})`,
		);
		return deleted;
	});

	const regionDeleted = await Promise.all(regionPromises);
	return regionDeleted.reduce((sum, d) => sum + d, 0);
};
