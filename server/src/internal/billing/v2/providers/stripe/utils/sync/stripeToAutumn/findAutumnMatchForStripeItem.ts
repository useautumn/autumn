import type { FullProduct } from "@autumn/shared";
import type {
	ItemDiff,
	ItemMatch,
} from "@/internal/billing/v2/actions/sync/detect/types";
import { findStripeMatchForAutumnPrice } from "../matchUtils/findStripeMatchForAutumnPrice";
import { findStripeMatchForAutumnProduct } from "../matchUtils/findStripeMatchForAutumnProduct";
import type { StripeItemSnapshot } from "../stripeItemSnapshot/types";

/**
 * Match a single StripeItemSnapshot against the supplied Autumn products.
 *
 * Walks every Autumn price (priority 1+2) before falling back to the
 * product-level match (priority 3). The matched Autumn resource(s) are
 * embedded on the returned ItemMatch so callers never need to re-look-up
 * by id.
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
				stripeProductIds,
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

	for (const product of fullProducts) {
		const matched_on = findStripeMatchForAutumnProduct({
			product,
			stripeProductIds,
		});
		if (matched_on) {
			return {
				stripe: item,
				match: { kind: "autumn_product", matched_on, product },
			};
		}
	}

	const noMatch: ItemMatch = { kind: "none" };
	return { stripe: item, match: noMatch };
};
