import type { FullCusProduct } from "@autumn/shared";
import { CacheManager } from "@/utils/cacheUtils/CacheManager";

const getExpiredCacheKey = (stripeSubscriptionId: string) =>
	`expired-cus-products:${stripeSubscriptionId}`;

/**
 * Retrieves cached expired customer products for a subscription.
 * Used by invoice.created to access products that were expired by subscription.deleted.
 */
export const getExpiredCustomerProductsCache = async ({
	stripeSubscriptionId,
}: {
	stripeSubscriptionId: string;
}): Promise<FullCusProduct[] | null> => {
	const key = getExpiredCacheKey(stripeSubscriptionId);
	return await CacheManager.getJson<FullCusProduct[]>(key);
};

export const getExpiredCustomerProductsCacheAndMerge = async ({
	customerProducts,
	stripeSubscriptionId,
}: {
	customerProducts: FullCusProduct[];
	stripeSubscriptionId: string;
}): Promise<FullCusProduct[]> => {
	const cachedExpired = await getExpiredCustomerProductsCache({
		stripeSubscriptionId,
	});

	if (cachedExpired && cachedExpired.length > 0) {
		const existingIds = new Set(customerProducts.map((cp) => cp.id));
		const expiredToAdd = cachedExpired.filter((cp) => !existingIds.has(cp.id));
		return [...customerProducts, ...expiredToAdd];
	}

	return customerProducts;
};
