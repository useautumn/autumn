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

export const getExpiredCustomerProductsCacheAndMerge = async ({
	ctx,
	customerProducts,
	stripeSubscriptionId,
}: {
	ctx: AutumnContext;
	customerProducts: FullCusProduct[];
	stripeSubscriptionId: string;
}): Promise<FullCusProduct[]> => {
	const cachedExpired = await getExpiredCustomerProductsCache({
		ctx,
		stripeSubscriptionId,
	});

	if (cachedExpired && cachedExpired.length > 0) {
		const existingIds = new Set(customerProducts.map((cp) => cp.id));
		const expiredToAdd = cachedExpired.filter((cp) => !existingIds.has(cp.id));
		return [...customerProducts, ...expiredToAdd];
	}

	return customerProducts;
};
