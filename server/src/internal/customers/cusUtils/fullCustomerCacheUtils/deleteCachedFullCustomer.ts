import { invalidateCache } from "@/external/redis/orgRedisPool.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import {
	buildFullCustomerCacheKey,
	FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS,
} from "./fullCustomerCacheConfig.js";

/**
 * Delete FullCustomer from Redis cache.
 * For orgs with their own Redis (redis_config set), deletes from that instance only.
 * For orgs on master Redis, deletes from all configured regions.
 * @param skipGuard - If true, skips setting the guard key. Default false.
 */
export const deleteCachedFullCustomer = async ({
	customerId,
	ctx,
	source,
	skipGuard = false,
}: {
	customerId: string;
	ctx: AutumnContext;
	source?: string;
	skipGuard?: boolean;
}): Promise<void> => {
	const { org, env, logger } = ctx;

	if (!customerId) return;

	const cacheKey = buildFullCustomerCacheKey({
		orgId: org.id,
		env,
		customerId,
	});
	const guardTimestamp = Date.now().toString();

	await invalidateCache({
		orgId: org.id,
		migrationPercent: org.redis_config?.migrationPercent,
		fn: async (instance, label) => {
			const result = await instance.deleteFullCustomerCache(
				cacheKey,
				org.id,
				env,
				customerId,
				guardTimestamp,
				FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS.toString(),
				skipGuard.toString(),
			);
			logger.info(
				`[deleteCachedFullCustomer] ${label}: ${result}, customer: ${customerId}, source: ${source}`,
			);
		},
	});
};
