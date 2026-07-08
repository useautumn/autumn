import {
	type FullProduct,
	isFixedPrice,
	type Organization,
} from "@autumn/shared";
import { findAutumnMatchForStripeItem } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeToAutumn/findAutumnMatchForStripeItem";
import type { ItemDiff } from "./types";

// A product is anchored when an item claims its base: a fixed-price match
// (exact id or base shape) or a product-level match (custom base).
const anchoredProductsFromDiffs = ({
	itemDiffs,
}: {
	itemDiffs: ItemDiff[];
}): FullProduct[] => {
	const byInternalId = new Map<string, FullProduct>();
	for (const diff of itemDiffs) {
		const match = diff.match;
		if (match.kind === "autumn_product") {
			byInternalId.set(match.product.internal_id, match.product);
		} else if (match.kind === "autumn_price" && isFixedPrice(match.price)) {
			byInternalId.set(match.product.internal_id, match.product);
		}
	}
	return [...byInternalId.values()];
};

/**
 * Shared Stripe prices are stamped on several plans' feature prices, so a
 * per-item catalog walk can attach an item to a plan the subscription doesn't
 * carry. Re-match feature items within the anchored plans first; the global
 * catalog match stands only when no anchored plan claims the item.
 */
export const rematchFeaturesWithinAnchoredPlans = ({
	itemDiffs,
	org,
}: {
	itemDiffs: ItemDiff[];
	org?: Organization;
}): ItemDiff[] => {
	const anchoredProducts = anchoredProductsFromDiffs({ itemDiffs });
	if (anchoredProducts.length === 0) return itemDiffs;
	const anchoredIds = new Set(anchoredProducts.map((p) => p.internal_id));

	return itemDiffs.map((diff) => {
		const match = diff.match;
		// Rematchable: an unresolved item (possibly ambiguous across sibling
		// plans) or a feature price attached to a plan outside the anchored set.
		const rematchable =
			match.kind === "none" ||
			(match.kind === "autumn_price" &&
				!isFixedPrice(match.price) &&
				!anchoredIds.has(match.product.internal_id));
		if (!rematchable) return diff;

		const rematched = findAutumnMatchForStripeItem({
			item: diff.stripe,
			fullProducts: anchoredProducts,
			org,
		});
		// Only a price-level hit may steal the item — a product-level rematch
		// would mutate the anchored plan's base decision.
		return rematched.match.kind === "autumn_price" ? rematched : diff;
	});
};
