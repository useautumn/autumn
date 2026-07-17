import type { FullProduct, Organization } from "@autumn/shared";
import type { ItemDiff } from "@/internal/billing/v2/actions/sync/detect/types";
import {
	findProductLevelMatchForStripeItem,
	type ProductLevelMatchCandidate,
} from "../matchUtils/findProductLevelMatchForStripeItem";
import { findStripeMatchForAutumnProduct } from "../matchUtils/findStripeMatchForAutumnProduct";
import { getStripePriceIdsForAutumnPrice } from "../matchUtils/getStripePriceIdsForAutumnPrice";
import { climbLicenseMatch } from "../matchUtils/licenseMatchUtils/climbLicenseMatch";
import type { StripeItemSnapshot } from "../stripeItemSnapshot/types";

/**
 * Match a single StripeItemSnapshot against the supplied Autumn products.
 * First hit wins, in order:
 *
 *   1. stripe_price_id — an Autumn price stores this exact Stripe price id.
 *   2. Product-level — the item's Stripe product is linked to Autumn
 *      product(s), via the product mapping or a price's
 *      config.stripe_product_id. Within candidates the item resolves by
 *      keying/shape: non-fixed price keyed to the product (stripe_product_id,
 *      id-only — covers Autumn's custom price variants), base price
 *      (stripe_base_price_shape), prepaid price (stripe_prepaid_price_shape),
 *      or the product itself (autumn_product = unrecognized price on a known
 *      plan, single candidate only).
 *   3. kind: "none" — unresolved.
 *
 * Pure and sibling-blind — shared-price misattribution across plans is fixed
 * afterwards by rematchFeaturesWithinAnchoredPlans. `org` enables prepaid
 * shape matching at tier 2.
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
	for (const product of fullProducts) {
		for (const price of product.prices) {
			const matchedPriceId = getStripePriceIdsForAutumnPrice({ price }).find(
				(id) => id === item.stripe_price_id,
			);
			if (matchedPriceId) {
				return {
					stripe: item,
					match: climbLicenseMatch({
						item,
						match: {
							kind: "autumn_price",
							matched_on: {
								type: "stripe_price_id",
								stripe_price_id: matchedPriceId,
							},
							price,
							product,
						},
					}),
				};
			}
		}
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
			match: climbLicenseMatch({
				item,
				match: {
					kind: "autumn_price",
					matched_on: productMatch.priceMatch.matched_on,
					price: productMatch.priceMatch.price,
					product: productMatch.product,
				},
			}),
		};
	}

	return {
		stripe: item,
		match: climbLicenseMatch({
			item,
			match: {
				kind: "autumn_product",
				matched_on: productMatch.matched_on,
				product: productMatch.product,
			},
		}),
	};
};
