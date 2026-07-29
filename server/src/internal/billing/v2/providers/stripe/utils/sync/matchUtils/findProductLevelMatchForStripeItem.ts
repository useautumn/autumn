import {
	type FullProduct,
	isFixedPrice,
	isPrepaidPrice,
	type Organization,
	type Price,
	priceToEnt,
	type UsagePriceConfig,
} from "@autumn/shared";
import {
	autumnBasePriceToStripePriceShape,
	autumnPrepaidPriceToStripePriceShape,
} from "../../matchUtils/autumnPriceShape";
import {
	stripeItemSnapshotToShape,
	stripePriceShapesEqual,
} from "../../matchUtils/stripePriceShape";
import type { StripeItemSnapshot } from "../stripeItemSnapshot/types";
import type {
	PriceMatchCondition,
	ProductMatchCondition,
} from "./matchConditions";

export type ProductLevelMatchCandidate = {
	product: FullProduct;
	matched_on: ProductMatchCondition;
};

export type ProductLevelPriceMatch = {
	price: Price;
	matched_on: PriceMatchCondition;
};

export type ProductLevelMatch = ProductLevelMatchCandidate & {
	priceMatch: ProductLevelPriceMatch | null;
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

/**
 * A non-fixed price keyed to the item's Stripe product claims it by id alone —
 * Autumn groups its own price variants (custom amounts) under that product.
 */
const findKeyedPrice = ({
	item,
	candidate,
}: {
	item: StripeItemSnapshot;
	candidate: ProductLevelMatchCandidate;
}): Price | null =>
	candidate.product.prices.find((price) => {
		if (isFixedPrice(price)) return false;
		const config = price.config as UsagePriceConfig;
		return config.stripe_product_id === item.stripe_product_id;
	}) ?? null;

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

/**
 * Prepaid prices are matched by their TOTAL (allowance-inclusive) shape —
 * Stripe-native licensed prices under a mapped product resolve to the plan's
 * prepaid price when amounts/tiers line up (the imported add-on case).
 */
const findMatchingPrepaidPrice = ({
	item,
	candidate,
	org,
}: {
	item: StripeItemSnapshot;
	candidate: ProductLevelMatchCandidate;
	org: Organization;
}): Price | null => {
	if (!item.currency) return null;
	if (item.recurring_usage_type === "metered") return null;

	const stripeItemShape = stripeItemSnapshotToShape({ item });
	if (!stripeItemShape) return null;

	for (const price of candidate.product.prices) {
		if (!isPrepaidPrice(price)) continue;
		const entitlement = priceToEnt({
			price,
			entitlements: candidate.product.entitlements,
		});
		if (!entitlement) continue;

		const prepaidShape = autumnPrepaidPriceToStripePriceShape({
			price,
			entitlement,
			stripeProductId: candidate.matched_on.stripe_product_id,
			currency: item.currency,
			org,
		});
		if (prepaidShape && stripePriceShapesEqual(stripeItemShape, prepaidShape)) {
			return price;
		}
	}
	return null;
};

/** Which price on the candidate claims the item: keyed id first, then shape. */
const resolvePriceMatch = ({
	item,
	candidate,
	org,
}: {
	item: StripeItemSnapshot;
	candidate: ProductLevelMatchCandidate;
	org?: Organization;
}): ProductLevelPriceMatch | null => {
	const keyedPrice = findKeyedPrice({ item, candidate });
	if (keyedPrice) {
		return {
			price: keyedPrice,
			matched_on: {
				type: "stripe_product_id",
				stripe_product_id: item.stripe_product_id,
			},
		};
	}

	const shapeMatchedOn = {
		stripe_product_id: candidate.matched_on.stripe_product_id,
		stripe_price_id: item.stripe_price_id,
	};

	const basePrice = findMatchingBasePrice({ item, candidate });
	if (basePrice) {
		return {
			price: basePrice,
			matched_on: { type: "stripe_base_price_shape", ...shapeMatchedOn },
		};
	}

	const prepaidPrice = org
		? findMatchingPrepaidPrice({ item, candidate, org })
		: null;
	if (prepaidPrice) {
		return {
			price: prepaidPrice,
			matched_on: { type: "stripe_prepaid_price_shape", ...shapeMatchedOn },
		};
	}

	return null;
};

export const findProductLevelMatchForStripeItem = ({
	item,
	candidates,
	org,
}: {
	item: StripeItemSnapshot;
	candidates: ProductLevelMatchCandidate[];
	org?: Organization;
}): ProductLevelMatch | null => {
	if (candidates.length === 0) return null;

	const resolved: ProductLevelMatch[] = candidates.map((candidate) => ({
		...candidate,
		priceMatch: resolvePriceMatch({ item, candidate, org }),
	}));

	// A claim-less single candidate is only a plausible custom base under the
	// same gate multi-candidate fallback uses — a metered item must not
	// silently become a custom base with its price stripped.
	if (resolved.length === 1) {
		const only = resolved[0];
		if (!only) return null;
		if (only.priceMatch) return only;
		return basePlanFallback({ item, resolved });
	}

	// Ambiguous candidates resolve only via price claims, strongest kind
	// first — a unique claim of that kind wins, a tie is unresolvable.
	const claimPriority = [
		"stripe_product_id",
		"stripe_base_price_shape",
		"stripe_prepaid_price_shape",
	] as const;
	for (const type of claimPriority) {
		const claims = resolved.filter(
			(match) => match.priceMatch?.matched_on.type === type,
		);
		if (claims.length === 1) return claims[0] ?? null;
		if (claims.length > 1) return null;
	}

	return basePlanFallback({ item, resolved });
};

/**
 * No price claims at all: a plausible custom base falls back to the base plan
 * (variants defer to their base); first base plan wins if several.
 */
const basePlanFallback = ({
	item,
	resolved,
}: {
	item: StripeItemSnapshot;
	resolved: ProductLevelMatch[];
}): ProductLevelMatch | null => {
	// Mirrors stripeItemToBasePrice's gate — metered/tiered items are never a
	// custom base and must stay unmatched so the anchored rematch can claim them.
	if (item.recurring_usage_type === "metered") return null;
	if (item.unit_amount === null || !item.recurring_interval) return null;

	const basePlans = resolved.filter((match) => !match.product.base_variant_id);
	return basePlans[0] ?? null;
};
