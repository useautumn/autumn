import type { FullProduct, Organization } from "@autumn/shared";
import type { ItemDiff } from "@/internal/billing/v2/actions/sync/detect/types";
import {
	findProductLevelMatchForStripeItem,
	type ProductLevelMatchCandidate,
} from "../matchUtils/findProductLevelMatchForStripeItem";
import { findStripeMatchForAutumnProduct } from "../matchUtils/findStripeMatchForAutumnProduct";
import { getStripePriceIdsForAutumnPrice } from "../matchUtils/getStripePriceIdsForAutumnPrice";
import { climbLicenseMatch } from "../matchUtils/licenseMatchUtils/climbLicenseMatch";
import { findLicenseMatchForStripeItem } from "../matchUtils/licenseMatchUtils/findLicenseMatchForStripeItem";
import type { StripeItemSnapshot } from "../stripeItemSnapshot/types";

/** Matches exact top-level prices, license links, then product-level identity. */
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

	const licenseMatch = findLicenseMatchForStripeItem({ fullProducts, item });
	if (licenseMatch) return { stripe: item, match: licenseMatch };

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
