import type { FullCustomer } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import { tryRedisRead } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullCustomerCacheKey } from "./fullCustomerCacheConfig.js";

/**
 * Get FullCustomer from Redis cache
 * @returns FullCustomer if found, null if not in cache
 */
export const getCachedFullCustomer = async ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}): Promise<FullCustomer | null> => {
	const cacheKey = buildFullCustomerCacheKey({ orgId, env, customerId });

	const cached = await tryRedisRead(
		() => redis.call("JSON.GET", cacheKey) as Promise<string | null>,
	);

	if (!cached) return null;

	return JSON.parse(cached) as FullCustomer;
};
