import {
	cusProductToPrices,
	type FullCusProduct,
	isConsumablePrice,
} from "@autumn/shared";
import { setCachedExpiredCustomerProducts } from "@/external/redis/actions/expiredCustomerProductsCache/expiredCustomerProductsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const setExpiredCustomerProductsCache = async ({
	ctx,
	stripeSubscriptionId,
	customerProducts,
}: {
	ctx: AutumnContext;
	stripeSubscriptionId: string;
	customerProducts: FullCusProduct[];
}): Promise<void> => {
	const usageBasedCustomerProducts = customerProducts.filter((cp) => {
		const prices = cusProductToPrices({ cusProduct: cp });
		return prices.some((p) => isConsumablePrice(p));
	});

	await setCachedExpiredCustomerProducts({
		ctx,
		stripeSubscriptionId,
		customerProducts: usageBasedCustomerProducts,
	});
};
