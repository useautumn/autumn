import type { Checkout } from "@autumn/shared";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

/** Pinned: updated in place on status changes (write-through), so ramped
 *  readers on another instance would see stale checkouts for the full TTL. */
const CHECKOUT_CACHE_TTL_SECONDS = 86400;

export const buildCheckoutCacheKey = (checkoutId: string) =>
	`checkout:${checkoutId}`;

export const getCheckoutCache = async ({
	checkoutId,
}: {
	checkoutId: string;
}): Promise<Checkout | null> => {
	const miscRedis = getMiscRedis();
	const cacheKey = buildCheckoutCacheKey(checkoutId);

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(cacheKey),
		source: "checkout-cache:get",
		redisInstance: miscRedis,
	});
	if (!cached) return null;

	return JSON.parse(cached) as Checkout;
};

export const setCheckoutCache = async ({
	checkoutId,
	data,
}: {
	checkoutId: string;
	data: Checkout;
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const cacheKey = buildCheckoutCacheKey(checkoutId);

	await tryRedisOp({
		operation: () =>
			miscRedis.set(
				cacheKey,
				JSON.stringify(data),
				"EX",
				CHECKOUT_CACHE_TTL_SECONDS,
			),
		source: "checkout-cache:set",
		redisInstance: miscRedis,
	});
};

export const deleteCheckoutCache = async ({
	checkoutId,
}: {
	checkoutId: string;
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const cacheKey = buildCheckoutCacheKey(checkoutId);

	await tryRedisOp({
		operation: () => miscRedis.del(cacheKey),
		source: "checkout-cache:delete",
		redisInstance: miscRedis,
	});
};
