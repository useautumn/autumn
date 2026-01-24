import type { FullCustomer } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";
import {
	buildFullCustomerCacheGuardKey,
	buildFullCustomerCacheKey,
	FULL_CUSTOMER_CACHE_TTL_SECONDS,
} from "./fullCustomerCacheConfig.js";

type SetCacheResult = "OK" | "STALE_WRITE" | "CACHE_EXISTS" | "FAILED";

/**
 * Set FullCustomer in Redis cache
 * Includes stale write prevention using a guard key
 */
export const setCachedFullCustomer = async ({
	ctx,
	fullCustomer,
	customerId,
	fetchTimeMs,
	source,
	overwrite = false,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerId: string;
	fetchTimeMs: number;
	source?: string;
	overwrite?: boolean;
}): Promise<SetCacheResult> => {
	const { org, env, logger } = ctx;

	const cacheKey = buildFullCustomerCacheKey({
		orgId: org.id,
		env,
		customerId,
	});
	const guardKey = buildFullCustomerCacheGuardKey({
		orgId: org.id,
		env,
		customerId,
	});

	const result = await tryRedisWrite(async () => {
		return await redis.setFullCustomerCache(
			guardKey,
			cacheKey,
			String(fetchTimeMs),
			String(FULL_CUSTOMER_CACHE_TTL_SECONDS),
			JSON.stringify(fullCustomer),
			String(overwrite),
		);
	});

	if (result === null) {
		logger.warn(`[setCachedFullCustomer] Redis write failed for ${customerId}`);
		return "FAILED";
	}

	logger.info(
		`[setCachedFullCustomer] ${customerId}: ${result}, source: ${source}`,
	);
	addToExtraLogs({
		ctx,
		extras: {
			setCache: {
				result,
				fullCustomer,
			},
		},
	});

	return result;
};
