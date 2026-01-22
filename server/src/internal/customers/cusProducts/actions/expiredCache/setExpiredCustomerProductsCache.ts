import type { FullCusProduct } from "@autumn/shared";
import { CacheManager } from "@/utils/cacheUtils/CacheManager";

const getExpiredCacheKey = (stripeSubscriptionId: string) =>
	`expired-cus-products:${stripeSubscriptionId}`;

/**
 * Caches expired customer products for a subscription.
 * This allows invoice.created to access products that were expired by subscription.deleted.
 *
 * TTL: 5 minutes (300 seconds) - enough time for invoice.created to process
 */
export const setExpiredCustomerProductsCache = async ({
	stripeSubscriptionId,
	customerProducts,
}: {
	stripeSubscriptionId: string;
	customerProducts: FullCusProduct[];
}): Promise<void> => {
	const key = getExpiredCacheKey(stripeSubscriptionId);
	await CacheManager.setJson(key, customerProducts, 300);
};
