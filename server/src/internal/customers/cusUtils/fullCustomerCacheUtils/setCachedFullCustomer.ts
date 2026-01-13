import type { FullCustomer } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
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
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerId: string;
	fetchTimeMs: number;
	source?: string;
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
		// Check if guard exists (deletion happened recently)
		const guardTime = await redis.get(guardKey);
		if (guardTime && Number(guardTime) > fetchTimeMs) {
			return "STALE_WRITE" as const;
		}

		// Check if cache already exists (JSON.TYPE returns null if key doesn't exist)
		const existing = await redis.call("JSON.TYPE", cacheKey);
		if (existing) {
			return "CACHE_EXISTS" as const;
		}

		// Set the cache using JSON.SET (stores as native JSON for JSONPath operations)
		const serialized = JSON.stringify(fullCustomer);
		await redis.call("JSON.SET", cacheKey, "$", serialized);
		await redis.expire(cacheKey, FULL_CUSTOMER_CACHE_TTL_SECONDS);

		return "OK" as const;
	});

	if (result === null) {
		logger.warn(`[setCachedFullCustomer] Redis write failed for ${customerId}`);
		return "FAILED";
	}

	if (result === "STALE_WRITE") {
		logger.info(
			`[setCachedFullCustomer] Stale write blocked for ${customerId}, source: ${source}`,
		);
	} else if (result === "CACHE_EXISTS") {
		logger.debug(
			`[setCachedFullCustomer] Cache already exists for ${customerId}, source: ${source}`,
		);
	} else {
		logger.info(
			`[setCachedFullCustomer] Set cache for ${customerId}, source: ${source}`,
		);
	}

	return result;
};
