import type { OrgRedisConfig } from "@autumn/shared";
import type { Redis } from "ioredis";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { invalidateCache } from "@/external/redis/orgRedisPool.js";
import { buildPathIndexKey } from "@/internal/customers/cache/pathIndex/pathIndexConfig.js";
import {
	buildFullCustomerCacheGuardKey,
	buildFullCustomerCacheKey,
	FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS,
} from "./fullCustomerCacheConfig.js";

export type CustomerToDelete = {
	orgId: string;
	env: string;
	customerId: string;
	redisConfig?: OrgRedisConfig | null;
};

/**
 * Per org: all keys share `{orgId}` so Redis Cluster stays in one slot per pipeline.
 */
const deleteFullCustomerCacheRowsForOrg = async ({
	redisInstance,
	orgCustomers,
	guardTimestamp,
}: {
	redisInstance: Redis;
	orgCustomers: CustomerToDelete[];
	guardTimestamp: string;
}): Promise<number> => {
	if (orgCustomers.length === 0) return 0;

	const pipeline = redisInstance.pipeline();
	for (const customer of orgCustomers) {
		const { orgId, env, customerId } = customer;
		const guardKey = buildFullCustomerCacheGuardKey({ orgId, env, customerId });
		const cacheKey = buildFullCustomerCacheKey({ orgId, env, customerId });
		const pathIndexKey = buildPathIndexKey({ orgId, env, customerId });
		pipeline.set(
			guardKey,
			guardTimestamp,
			"EX",
			FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS,
		);
		pipeline.unlink(cacheKey);
		pipeline.unlink(pathIndexKey);
	}

	const deleteResults = await pipeline.exec();
	if (!deleteResults) return 0;

	let deleted = 0;
	for (
		let customerIndex = 0;
		customerIndex < orgCustomers.length;
		customerIndex++
	) {
		const baseIndex = customerIndex * 3;
		for (let commandOffset = 0; commandOffset < 3; commandOffset++) {
			const tuple = deleteResults[baseIndex + commandOffset];
			if (!tuple)
				throw new Error(
					"batchDeleteCachedFullCustomers: missing pipeline result",
				);
			const [error] = tuple;
			if (error) throw error;
		}
		const unlinkCacheTuple = deleteResults[baseIndex + 1];
		const unlinkCount = unlinkCacheTuple![1] as number;
		if (unlinkCount > 0) deleted += 1;
	}

	return deleted;
};

/**
 * Batch delete multiple FullCustomer caches. Uses invalidateCache per org
 * to hit both dedicated org Redis AND all master regions (idempotent).
 */
export const batchDeleteCachedFullCustomers = async ({
	customers,
	logger,
}: {
	customers: CustomerToDelete[];
	logger?: Logger;
}): Promise<number> => {
	if (customers.length === 0) return 0;

	const log = logger ?? console;

	const customersByOrg = new Map<string, CustomerToDelete[]>();
	for (const customer of customers) {
		const existing = customersByOrg.get(customer.orgId) || [];
		existing.push(customer);
		customersByOrg.set(customer.orgId, existing);
	}

	const guardTimestamp = Date.now().toString();

	log.info(
		`[batchDeleteCachedFullCustomers] starting: ${customers.length} customers across ${customersByOrg.size} orgs`,
	);
	console.log(
		`[batchDeleteCachedFullCustomers] starting: ${customers.length} customers across ${customersByOrg.size} orgs`,
	);

	const orgPromises = Array.from(customersByOrg.entries()).map(
		async ([orgId, orgCustomers]) => {
			let totalDeleted = 0;

			await invalidateCache({
				org: { id: orgId, redis_config: orgCustomers[0]?.redisConfig },
				fn: async (instance, label) => {
					const deleted = await deleteFullCustomerCacheRowsForOrg({
						redisInstance: instance,
						orgCustomers,
						guardTimestamp,
					});
					totalDeleted += deleted;
					log.info(
						`[batchDeleteCachedFullCustomers] ${label}: ${deleted}/${orgCustomers.length} cache hits for org ${orgId}`,
					);
				},
			});

			console.log(
				`[batchDeleteCachedFullCustomers] ${orgId}: ${totalDeleted}/${customers.length} cache hits across ${customersByOrg.size} orgs`,
			);

			return totalDeleted;
		},
	);

	const deletedCounts = await Promise.all(orgPromises);
	const totalDeleted = deletedCounts.reduce((sum, count) => sum + count, 0);

	log.info(
		`[batchDeleteCachedFullCustomers] done: ${totalDeleted}/${customers.length} cache hits across ${customersByOrg.size} orgs`,
	);

	return totalDeleted;
};
