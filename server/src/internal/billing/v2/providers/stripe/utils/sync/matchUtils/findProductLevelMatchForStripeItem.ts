import {
	type FullProduct,
	isFixedPrice,
	type Price,
} from "@autumn/shared";
import { autumnBasePriceToStripePriceShape } from "../../matchUtils/autumnPriceShape";
import {
	stripeItemSnapshotToShape,
	stripePriceShapesEqual,
} from "../../matchUtils/stripePriceShape";
import type { StripeItemSnapshot } from "../stripeItemSnapshot/types";
import type { ProductMatchCondition } from "./matchConditions";

export type ProductLevelMatchCandidate = {
	product: FullProduct;
	matched_on: ProductMatchCondition;
};

export type ProductLevelMatch = ProductLevelMatchCandidate & {
	basePrice: Price | null;
};

export const stripeItemMatchesBasePrice = ({
	item,
	basePrice,
	stripeProductId,
}: {
	item: StripeItemSnapshot;
	basePrice: Price;
	stripeProductId: string;
}) => {
	if (!isFixedPrice(basePrice)) return false;
	if (!item.currency) return false;

	const stripeItemShape = stripeItemSnapshotToShape({ item });
	const autumnBaseShape = autumnBasePriceToStripePriceShape({
		price: basePrice,
		stripeProductId,
		currency: item.currency,
	});

	if (!stripeItemShape || !autumnBaseShape) return false;
	return stripePriceShapesEqual(stripeItemShape, autumnBaseShape);
};

const findMatchingBasePrice = ({
	item,
	candidate,
}: {
	item: StripeItemSnapshot;
	candidate: ProductLevelMatchCandidate;
}): Price | null => {
	const basePrice = candidate.product.prices.find(isFixedPrice);
	if (!basePrice) return null;
	if (
		!stripeItemMatchesBasePrice({
			item,
			basePrice,
			stripeProductId: candidate.matched_on.stripe_product_id,
		})
	) {
		return null;
	}
	return basePrice;
};

export const findProductLevelMatchForStripeItem = ({
	item,
	candidates,
}: {
	item: StripeItemSnapshot;
	candidates: ProductLevelMatchCandidate[];
}): ProductLevelMatch | null => {
	if (candidates.length === 0) return null;
	if (candidates.length === 1) {
		const candidate = candidates[0];
		return candidate ? { ...candidate, basePrice: null } : null;
	}

	const basePriceMatches: ProductLevelMatch[] = [];
	for (const candidate of candidates) {
		const basePrice = findMatchingBasePrice({ item, candidate });
		if (basePrice) {
			basePriceMatches.push({ ...candidate, basePrice });
		}
	}

	return basePriceMatches.length === 1 ? (basePriceMatches[0] ?? null) : null;
};
