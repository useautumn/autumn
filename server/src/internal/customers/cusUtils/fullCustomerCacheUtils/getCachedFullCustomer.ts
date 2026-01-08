import type { FullCustomer } from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { Redis } from "ioredis";
import { redis } from "@/external/redis/initRedis.js";
import { tryRedisRead } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullCustomerCacheKey } from "./fullCustomerCacheConfig.js";

/**
 * Round a number to avoid floating-point precision issues from JSON.NUMINCRBY.
 * Uses Decimal.js for consistent precision handling across the codebase.
 */
const roundBalance = (value: number | null | undefined): number => {
	if (value === null || value === undefined) return 0;
	// Use Decimal.js to handle precision, then convert back to number
	// toDecimalPlaces(10) gives us enough precision while avoiding floating-point artifacts
	return new Decimal(value).toDecimalPlaces(10).toNumber();
};

/**
 * Round all balance-related numeric fields in a FullCustomer object.
 * This handles floating-point precision issues that can accumulate
 * when using JSON.NUMINCRBY for atomic incremental updates.
 */
const roundFullCustomerBalances = (
	fullCustomer: FullCustomer,
): FullCustomer => {
	if (!fullCustomer.customer_products) return fullCustomer;

	for (const cusProduct of fullCustomer.customer_products) {
		if (!cusProduct.customer_entitlements) continue;

		for (const cusEnt of cusProduct.customer_entitlements) {
			// Round top-level balance fields
			if (cusEnt.balance !== null && cusEnt.balance !== undefined) {
				cusEnt.balance = roundBalance(cusEnt.balance);
			}
			if (cusEnt.adjustment !== null && cusEnt.adjustment !== undefined) {
				cusEnt.adjustment = roundBalance(cusEnt.adjustment);
			}
			if (
				cusEnt.additional_balance !== null &&
				cusEnt.additional_balance !== undefined
			) {
				cusEnt.additional_balance = roundBalance(cusEnt.additional_balance);
			}

			// Round entity-scoped balances
			if (cusEnt.entities && typeof cusEnt.entities === "object") {
				for (const entityId of Object.keys(cusEnt.entities)) {
					const entityData = cusEnt.entities[entityId];
					if (entityData && typeof entityData === "object") {
						if (
							entityData.balance !== null &&
							entityData.balance !== undefined
						) {
							entityData.balance = roundBalance(entityData.balance);
						}
						if (
							entityData.adjustment !== null &&
							entityData.adjustment !== undefined
						) {
							entityData.adjustment = roundBalance(entityData.adjustment);
						}
					}
				}
			}

			// Round rollover balances
			if (cusEnt.rollovers && Array.isArray(cusEnt.rollovers)) {
				for (const rollover of cusEnt.rollovers) {
					if (rollover.balance !== null && rollover.balance !== undefined) {
						rollover.balance = roundBalance(rollover.balance);
					}
				}
			}
		}
	}

	return fullCustomer;
};

/**
 * Get FullCustomer from Redis cache
 * @returns FullCustomer if found, null if not in cache
 */
export const getCachedFullCustomer = async ({
	orgId,
	env,
	customerId,
	redisInstance,
}: {
	orgId: string;
	env: string;
	customerId: string;
	redisInstance?: Redis;
}): Promise<FullCustomer | null> => {
	const cacheKey = buildFullCustomerCacheKey({ orgId, env, customerId });
	const redisClient = redisInstance || redis;

	const cached = await tryRedisRead(
		() => redisClient.call("JSON.GET", cacheKey) as Promise<string | null>,
	);

	if (!cached) return null;

	const fullCustomer = JSON.parse(cached) as FullCustomer;

	// Round balance fields to handle floating-point precision from JSON.NUMINCRBY
	return roundFullCustomerBalances(fullCustomer);
};
