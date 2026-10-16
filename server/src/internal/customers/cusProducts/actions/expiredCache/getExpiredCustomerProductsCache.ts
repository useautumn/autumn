import type { FullCusProduct } from "@autumn/shared";
import { getCachedExpiredCustomerProducts } from "@/external/redis/actions/expiredCustomerProductsCache/expiredCustomerProductsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const getExpiredCustomerProductsCache = async ({
	ctx,
	stripeSubscriptionId,
}: {
	ctx: AutumnContext;
	stripeSubscriptionId: string;
}): Promise<FullCusProduct[] | null> =>
	getCachedExpiredCustomerProducts({ ctx, stripeSubscriptionId });

/** The cache is keyed by subscription, which several customers can share, so only this customer's products are merged. */
export const getExpiredCustomerProductsCacheAndMerge = async ({
	ctx,
	customerProducts,
	stripeSubscriptionId,
	internalCustomerId,
}: {
	ctx: AutumnContext;
	customerProducts: FullCusProduct[];
	stripeSubscriptionId: string;
	internalCustomerId: string;
}): Promise<FullCusProduct[]> => {
	const cachedExpired = await getExpiredCustomerProductsCache({
		ctx,
		stripeSubscriptionId,
	});

	if (cachedExpired && cachedExpired.length > 0) {
		const existingIds = new Set(customerProducts.map((cp) => cp.id));
		const expiredToAdd = cachedExpired.filter(
			(cp) =>
				!existingIds.has(cp.id) &&
				cp.internal_customer_id === internalCustomerId,
		);
		return [...customerProducts, ...expiredToAdd];
	}

	return customerProducts;
};
