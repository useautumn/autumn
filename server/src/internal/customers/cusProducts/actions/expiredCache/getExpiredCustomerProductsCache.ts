import type { FullCusProduct } from "@autumn/shared";
import { getCachedExpiredCustomerProducts } from "@/external/redis/actions/expiredCustomerProductsCache/expiredCustomerProductsCache.js";

export const getExpiredCustomerProductsCache = async ({
	stripeSubscriptionId,
}: {
	stripeSubscriptionId: string;
}): Promise<FullCusProduct[] | null> =>
	getCachedExpiredCustomerProducts({ stripeSubscriptionId });

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
