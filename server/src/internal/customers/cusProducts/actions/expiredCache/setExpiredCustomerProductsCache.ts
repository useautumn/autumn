import {
	cusProductToPrices,
	type FullCusProduct,
	isConsumablePrice,
} from "@autumn/shared";
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
	// Filter customer products only for those with usage based prices
	const usageBasedCustomerProducts = customerProducts.filter((cp) => {
		const prices = cusProductToPrices({ cusProduct: cp });
		return prices.some((p) => isConsumablePrice(p));
	});

	const key = getExpiredCacheKey(stripeSubscriptionId);
	await CacheManager.setJson(key, usageBasedCustomerProducts, 300);
};
