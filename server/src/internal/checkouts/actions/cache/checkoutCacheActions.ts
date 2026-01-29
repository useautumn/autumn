import type { Checkout } from "@autumn/shared";
import { CacheManager } from "@/utils/cacheUtils/CacheManager";

const getCheckoutCacheKey = (checkoutId: string) => `checkout:${checkoutId}`;

// 24 hours in seconds
const CHECKOUT_TTL_SECONDS = 86400;

export const getCheckoutCache = async ({
	checkoutId,
}: {
	checkoutId: string;
}): Promise<Checkout | null> => {
	const key = getCheckoutCacheKey(checkoutId);
	return await CacheManager.getJson<Checkout>(key);
};

export const setCheckoutCache = async ({
	checkoutId,
	data,
}: {
	checkoutId: string;
	data: Checkout;
}): Promise<void> => {
	const key = getCheckoutCacheKey(checkoutId);
	await CacheManager.setJson(key, data, CHECKOUT_TTL_SECONDS);
};

export const deleteCheckoutCache = async ({
	checkoutId,
}: {
	checkoutId: string;
}): Promise<void> => {
	const key = getCheckoutCacheKey(checkoutId);
	await CacheManager.del(key);
};
