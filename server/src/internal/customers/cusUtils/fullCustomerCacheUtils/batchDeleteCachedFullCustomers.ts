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

type CustomerToDelete = {
	orgId: string;
	env: string;
	customerId: string;
};

/**
 * Batch delete multiple FullCustomer caches.
 * Groups by orgId to ensure all keys in each batch are on the same Redis Cluster node.
 * Sets guard keys to prevent stale writes from in-flight requests.
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

	try {
		const guardTimestamp = Date.now().toString();

		// Use pipeline to batch all org deletions into one network round trip
		const pipeline = redis.pipeline();
		const orgIds: string[] = [];

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

			pipeline.batchDeleteFullCustomerCache(
				guardTimestamp,
				FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS.toString(),
				JSON.stringify(customersData),
			);
			orgIds.push(orgId);
		}

		const results = await pipeline.exec();

		// Sum up results from all orgs
		let totalDeleted = 0;
		let totalSkipped = 0;

		if (results) {
			for (const [error, resultJson] of results) {
				if (error) {
					log.error(
						`[batchDeleteCachedFullCustomers] Pipeline error: ${error}`,
					);
					throw error;
				}
				const result = JSON.parse(resultJson as string) as {
					deleted: number;
					skipped: number;
				};
				totalDeleted += result.deleted;
				totalSkipped += result.skipped;
			}
		}

		if (totalSkipped > 0) {
			log.info(
				`[batchDeleteCachedFullCustomers] Skipped ${totalSkipped} customers (test guard), deleted ${totalDeleted}, source: ${source}`,
			);
		} else {
			log.info(
				`[batchDeleteCachedFullCustomers] Deleted ${totalDeleted} keys for ${customers.length} customers across ${customersByOrg.size} orgs, source: ${source}`,
			);
		}

		return totalDeleted;
	} catch (error) {
		log.error(`[batchDeleteCachedFullCustomers] Error: ${error}`);
		throw error;
	}
};
