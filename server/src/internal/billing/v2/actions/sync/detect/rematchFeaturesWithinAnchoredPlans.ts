import {
	type FullProduct,
	isFixedPrice,
	type Organization,
} from "@autumn/shared";
import { findAutumnMatchForStripeItem } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeToAutumn/findAutumnMatchForStripeItem";
import type { ItemDiff } from "./types";

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
		return rematched.match.kind === "autumn_price" ? rematched : diff;
	});
};
