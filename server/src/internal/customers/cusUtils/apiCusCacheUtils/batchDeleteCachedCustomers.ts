import type { OrgRedisConfig } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import { batchDeleteCachedFullCustomers } from "../fullCustomerCacheUtils/batchDeleteCachedFullCustomers";

/**
 * Batch delete multiple customer caches in one Redis operation across ALL regions.
 * This ensures cache consistency and prevents race conditions where
 * a stale cache in another region could be read after deletion.
 */
export const batchDeleteCachedCustomers = async ({
	customers,
}: {
	customers: Array<{
		orgId: string;
		env: string;
		customerId: string;
		redisConfig?: OrgRedisConfig | null;
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

	await batchDeleteCachedFullCustomers({ customers });
	return customers.length;
};
