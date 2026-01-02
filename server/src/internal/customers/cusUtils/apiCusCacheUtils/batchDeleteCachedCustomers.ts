import * as Sentry from "@sentry/bun";
import { redis } from "@/external/redis/initRedis.js";
import { CACHE_CUSTOMER_VERSIONS } from "../../../../_luaScripts/cacheConfig";

/**
 * Batch delete multiple customer caches in one Redis operation
 * Much more efficient than calling deleteCachedApiCustomer multiple times
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

	try {
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

		// Use pipeline to batch all org deletions into one network round trip
		const pipeline = redis.pipeline();

		for (const orgCustomers of customersByOrg.values()) {
			pipeline.batchDeleteCustomers(
				CACHE_CUSTOMER_VERSIONS.LATEST,
				JSON.stringify(orgCustomers),
			);
			pipeline.batchDeleteCustomers(
				CACHE_CUSTOMER_VERSIONS.PREVIOUS,
				JSON.stringify(orgCustomers),
			);
		}

		const results = await pipeline.exec();

		// Sum up all deleted counts
		let totalDeleted = 0;
		if (results) {
			for (const [error, result] of results) {
				if (error) {
					console.error("Error in pipeline batch delete:", error);
					throw error;
				}
				totalDeleted += result as number;
			}
		}

		console.log(
			`Batch deleted ${totalDeleted} cache keys for ${customers.length} customers across ${customersByOrg.size} orgs`,
		);

		return totalDeleted;
	} catch (error) {
		console.error("Error batch deleting customers:", error);
		Sentry.captureException(error);
		throw error;
	}
};
