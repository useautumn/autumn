import type { FullCusProduct, Price, Product } from "@autumn/shared";
import { getStripePriceIdsForAutumnPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/getStripePriceIdsForAutumnPrice";

export type StoredPriceCatalog = Map<
	string,
	{ price: Price; product: Product; cusPriceIds: Set<string> }
>;

/** Maps a customer_price id to its originating Autumn price + product. Covers
 * inline (entity-scoped) prices too, which have no stable Stripe price id and
 * so never appear in `StoredPriceCatalog`. */
export type CusPriceCatalog = Map<string, { price: Price; product: Product }>;

/**
 * Maps every known Stripe price id for a customer's prices (a price can have both a
 * V1 `stripe_price_id` and a V2 `stripe_prepaid_price_v2_id` companion) back to the
 * originating Autumn price + product + customer_price id(s), so a stored item whose
 * id has drifted from whichever id `buildStripePhasesUpdate` picked can still be
 * resolved — either by its `autumn_customer_price_id` metadata (if present) or by
 * checking every known id for that price.
 */
export const buildStoredPriceCatalog = ({
	cusProducts,
}: {
	cusProducts: FullCusProduct[];
}): StoredPriceCatalog => {
	const catalog: StoredPriceCatalog = new Map();

	for (const cusProduct of cusProducts) {
		for (const cusPrice of cusProduct.customer_prices) {
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
				});
			}
		}
	}

	return catalog;
};

/** Maps every customer_price id (stored AND inline) to its Autumn price + product. */
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
