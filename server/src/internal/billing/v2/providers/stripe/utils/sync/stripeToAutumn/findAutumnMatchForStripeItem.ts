import type { FullProduct, Price } from "@autumn/shared";
import type {
	ItemDiff,
	ItemMatch,
} from "@/internal/billing/v2/actions/sync/detect/types";
import {
	findProductLevelMatchForStripeItem,
	type ProductLevelMatchCandidate,
} from "../matchUtils/findProductLevelMatchForStripeItem";
import { findStripeMatchForAutumnPrice } from "../matchUtils/findStripeMatchForAutumnPrice";
import { findStripeMatchForAutumnProduct } from "../matchUtils/findStripeMatchForAutumnProduct";
import type { StripeItemSnapshot } from "../stripeItemSnapshot/types";

export type PriceMatchCandidate = {
	price: Price;
	product: FullProduct;
};

/** All prices keyed to the item's Stripe product — callers disambiguate. */
export const collectStripeProductIdPriceCandidates = ({
	item,
	fullProducts,
}: {
	item: StripeItemSnapshot;
	fullProducts: FullProduct[];
}): PriceMatchCandidate[] => {
	const stripeProductIds = new Set([item.stripe_product_id]);
	const candidates: PriceMatchCandidate[] = [];
	for (const product of fullProducts) {
		for (const price of product.prices) {
			const matched_on = findStripeMatchForAutumnPrice({
				price,
				product,
				stripePriceIds: new Set<string>(),
				stripeProductIds,
			});
			if (matched_on?.type === "stripe_product_id") {
				candidates.push({ price, product });
			}
		}
	}
	return candidates;
};

/**
 * Match a single StripeItemSnapshot against the supplied Autumn products.
 *
 * Priority is global across the whole catalog: an exact `stripe_price_id`
 * match on ANY price beats every `stripe_product_id` match, which beats the
 * product-level base-shape fallback.
 *
 * Pure: no I/O, no sibling-aware decisions.
 */
export const findAutumnMatchForStripeItem = ({
	item,
	fullProducts,
}: {
	item: StripeItemSnapshot;
	fullProducts: FullProduct[];
}): ItemDiff => {
	const stripePriceIds = new Set([item.stripe_price_id]);
	const stripeProductIds = new Set([item.stripe_product_id]);

	for (const product of fullProducts) {
		for (const price of product.prices) {
			const matched_on = findStripeMatchForAutumnPrice({
				price,
				product,
				stripePriceIds,
				stripeProductIds: new Set<string>(),
			});
			if (matched_on) {
				return {
					stripe: item,
					match: {
						kind: "autumn_price",
						matched_on,
						price,
						product,
					},
				};
			}
		}
	}

	const priceCandidates = collectStripeProductIdPriceCandidates({
		item,
		fullProducts,
	});
	if (priceCandidates.length > 0) {
		const [chosen] = priceCandidates;
		return {
			stripe: item,
			match: {
				kind: "autumn_price",
				matched_on: {
					type: "stripe_product_id",
					stripe_product_id: item.stripe_product_id,
				},
				price: chosen.price,
				product: chosen.product,
			},
		};
	}

	const productCandidates: ProductLevelMatchCandidate[] = [];
	for (const product of fullProducts) {
		const matched_on = findStripeMatchForAutumnProduct({
			product,
			stripeProductIds,
		});
		if (matched_on) {
			productCandidates.push({ matched_on, product });
		}
	}

	const productMatch = findProductLevelMatchForStripeItem({
		item,
		candidates: productCandidates,
	});
	if (productMatch) {
		if (productMatch.basePrice) {
			return {
				stripe: item,
				match: {
					kind: "autumn_price",
					matched_on: {
						type: "stripe_base_price_shape",
						stripe_product_id: productMatch.matched_on.stripe_product_id,
						stripe_price_id: item.stripe_price_id,
					},
					price: productMatch.basePrice,
					product: productMatch.product,
				},
			};
		}

		return {
			stripe: item,
			match: {
				kind: "autumn_product",
				matched_on: productMatch.matched_on,
				product: productMatch.product,
			},
		};
	}

	const noMatch: ItemMatch = { kind: "none" };
	return { stripe: item, match: noMatch };
};
