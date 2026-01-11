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

/**
 * Batch delete multiple FullCustomer caches in one Redis pipeline.
 * Sets guard keys to prevent stale writes from in-flight requests.
 */
export const batchDeleteCachedFullCustomers = async ({
	customers,
	source,
	logger,
}: {
	customers: Array<{
		orgId: string;
		env: string;
		customerId: string;
	}>;
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

	try {
		const guardTimestamp = Date.now().toString();
		const pipeline = redis.pipeline();

		// Queue SET (guard) and DEL (cache) for each customer
		for (const { orgId, env, customerId } of customers) {
			const cacheKey = buildFullCustomerCacheKey({ orgId, env, customerId });
			const guardKey = buildFullCustomerCacheGuardKey({
				orgId,
				env,
				customerId,
			});

			pipeline.set(
				guardKey,
				guardTimestamp,
				"EX",
				FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS,
			);
			pipeline.del(cacheKey);
		}

		const results = await pipeline.exec();

		// Count deleted keys (every 2nd result is a DEL)
		let totalDeleted = 0;
		if (results) {
			for (let i = 1; i < results.length; i += 2) {
				const [error, deletedCount] = results[i];
				if (error) {
					log.error(`[batchDeleteCachedFullCustomers] Pipeline error: ${error}`);
					throw error;
				}
				totalDeleted += (deletedCount as number) ?? 0;
			}
		}

		log.info(
			`[batchDeleteCachedFullCustomers] Deleted ${totalDeleted} keys for ${customers.length} customers, source: ${source}`,
		);

		return totalDeleted;
	} catch (error) {
		log.error(`[batchDeleteCachedFullCustomers] Error: ${error}`);
		throw error;
	}
};
