import type { FullCusProduct } from "@autumn/shared";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

/** Pinned: written by subscription.deleted and read by invoice.created — two
 *  different requests, so ramp routing would break the handoff. */
const EXPIRED_CUSTOMER_PRODUCTS_TTL_SECONDS = 300;

export const buildExpiredCustomerProductsCacheKey = (
	stripeSubscriptionId: string,
) => `expired-cus-products:${stripeSubscriptionId}`;

export const getCachedExpiredCustomerProducts = async ({
	stripeSubscriptionId,
}: {
	stripeSubscriptionId: string;
}): Promise<FullCusProduct[] | null> => {
	const miscRedis = getMiscRedis();
	const cacheKey = buildExpiredCustomerProductsCacheKey(stripeSubscriptionId);

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(cacheKey),
		source: "expired-cus-products-cache:get",
		redisInstance: miscRedis,
	});
	if (!cached) return null;

	return JSON.parse(cached) as FullCusProduct[];
};

export const setCachedExpiredCustomerProducts = async ({
	stripeSubscriptionId,
	customerProducts,
}: {
	stripeSubscriptionId: string;
	customerProducts: FullCusProduct[];
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const cacheKey = buildExpiredCustomerProductsCacheKey(stripeSubscriptionId);

	await tryRedisOp({
		operation: () =>
			miscRedis.set(
				cacheKey,
				JSON.stringify(customerProducts),
				"EX",
				EXPIRED_CUSTOMER_PRODUCTS_TTL_SECONDS,
			),
		source: "expired-cus-products-cache:set",
		redisInstance: miscRedis,
	});
};
