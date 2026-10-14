import {
	cusPriceToCusEntWithCusProduct,
	type EntitlementWithFeature,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	isPrepaidPrice,
	type Price,
	type Product,
} from "@autumn/shared";
import { getStripePriceIdsForAutumnPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/getStripePriceIdsForAutumnPrice";

export type StoredPriceCatalog = Map<
	string,
	{
		price: Price;
		product: Product;
		cusPriceIds: Set<string>;
		entitlement?: EntitlementWithFeature;
		cusEnt?: FullCusEntWithFullCusProduct;
	}
>;

export type CusPriceCatalog = Map<string, { price: Price; product: Product }>;

export const buildStoredPriceCatalog = ({
	cusProducts,
}: {
	cusProducts: FullCusProduct[];
}): StoredPriceCatalog => {
	const catalog: StoredPriceCatalog = new Map();

	for (const cusProduct of cusProducts) {
		for (const cusPrice of cusProduct.customer_prices) {
			const cusEnt = isPrepaidPrice(cusPrice.price)
				? cusPriceToCusEntWithCusProduct({
						cusProduct,
						cusPrice,
						cusEnts: cusProduct.customer_entitlements,
					})
				: undefined;
			for (const stripePriceId of getStripePriceIdsForAutumnPrice({
				price: cusPrice.price,
			})) {
				const existing = catalog.get(stripePriceId);
				if (existing) {
					existing.cusPriceIds.add(cusPrice.id);
					continue;
				}
				catalog.set(stripePriceId, {
					price: cusPrice.price,
					product: cusProduct.product,
					cusPriceIds: new Set([cusPrice.id]),
					entitlement: cusEnt?.entitlement,
					cusEnt: cusEnt ?? undefined,
				});
			}
		}
	}

	return catalog;
};

export const buildCusPriceCatalog = ({
	cusProducts,
}: {
	cusProducts: FullCusProduct[];
}): CusPriceCatalog => {
	const catalog: CusPriceCatalog = new Map();

	for (const cusProduct of cusProducts) {
		for (const cusPrice of cusProduct.customer_prices) {
			catalog.set(cusPrice.id, {
				price: cusPrice.price,
				product: cusProduct.product,
			});
		}
	}

	return catalog;
};
