import type { FullProduct, Organization, Price } from "@autumn/shared";
import type { ItemDiff } from "@/internal/billing/v2/actions/sync/detect/types";
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
 * First hit wins, in order:
 *
 * Priority is global across the whole catalog: an exact `stripe_price_id`
 * match on ANY price beats every `stripe_product_id` match, which beats the
 * product-level base-shape fallback.
 *
 * Pure and sibling-blind — shared-price misattribution across plans is fixed
 * afterwards by rematchFeaturesWithinAnchoredPlans and
 * preferBaseAnchoredProductForProductIdMatches. `org` enables prepaid shape
 * matching at tier 3.
 */
export const findAutumnMatchForStripeItem = ({
	item,
	fullProducts,
	org,
}: {
	item: StripeItemSnapshot;
	fullProducts: FullProduct[];
	org?: Organization;
}): ItemDiff => {
	const stripePriceIds = new Set([item.stripe_price_id]);

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

	const stripeProductIds = new Set([item.stripe_product_id]);
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
		org,
	});
	if (!productMatch) return { stripe: item, match: { kind: "none" } };

	if (productMatch.priceMatch) {
		return {
			stripe: item,
			match: {
				kind: "autumn_price",
				matched_on: productMatch.priceMatch.matched_on,
				price: productMatch.priceMatch.price,
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
};
