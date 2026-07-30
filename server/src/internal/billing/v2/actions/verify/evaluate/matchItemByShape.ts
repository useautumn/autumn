import {
	atmnToStripeAmountDecimal,
	type EntitlementWithFeature,
	type FullCusEntWithFullCusProduct,
	isFixedPrice,
	isPrepaidPrice,
	type Organization,
	type Price,
	type Product,
	productToStripeIds,
	type StripeInlinePrice,
	type UsagePriceConfig,
} from "@autumn/shared";
import { priceToStripeRecurringParams } from "@utils/productUtils/priceUtils/convertPrice/priceToStripeRecurringParams";
import type Stripe from "stripe";
import { autumnPrepaidPriceToStripePriceShape } from "@/internal/billing/v2/providers/stripe/utils/matchUtils/autumnPriceShape";
import {
	inlinePriceToShape,
	type StripePriceShape,
	stripePriceShapesEqual,
	stripePriceToShape,
} from "@/internal/billing/v2/providers/stripe/utils/matchUtils/stripePriceShape";
import { cusEntToInlineStripePrice } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/cusPriceToStripeItemSpec/cusEntToInlineStripePrice";
import { stripePriceMatchesFixedPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/stripePriceMatchesAutumnPrice";

export type ShapeFallbackCandidate = {
	index: number;
	priceId: string;
	autumnCustomerPriceId?: string;
	price?: Stripe.Price;
	quantity?: number;
};

const candidateProductIdOf = (price: Stripe.Price): string | undefined => {
	const { product } = price;
	if (!product) return undefined;
	return typeof product === "string" ? product : product.id;
};

/** Items id-matching or tagged to a live cus price belong to id/metadata
 * matching — shape and totals tiers only consider the rest. */
const isMatchableByShape = ({
	candidate,
	isKnownPriceId,
	isValidCusPriceId,
}: {
	candidate: ShapeFallbackCandidate;
	isKnownPriceId: (priceId: string) => boolean;
	isValidCusPriceId: (cusPriceId: string) => boolean;
}): boolean => {
	if (!candidate.price) return false;
	if (isKnownPriceId(candidate.priceId)) return false;
	if (
		candidate.autumnCustomerPriceId &&
		isValidCusPriceId(candidate.autumnCustomerPriceId)
	) {
		return false;
	}
	return true;
};

/** All unclaimed items shape-matching a fixed price — a sub can bill one
 * logical fixed price across several items (the stored id + legacy ids). */
export const findFixedShapeSiblingIndexes = ({
	price,
	product,
	candidates,
	isKnownPriceId,
	isValidCusPriceId,
}: {
	price: Price;
	product: Product;
	candidates: ShapeFallbackCandidate[];
	isKnownPriceId: (priceId: string) => boolean;
	isValidCusPriceId: (cusPriceId: string) => boolean;
}): number[] => {
	if (!isFixedPrice(price)) return [];
	// Quantity-splitting stays same-product — a same-priced item from another
	// product is a separate finding, not a missing unit of this one.
	const productStripeIds = new Set(productToStripeIds({ product }));

	return candidates
		.filter((candidate) => {
			if (
				!isMatchableByShape({ candidate, isKnownPriceId, isValidCusPriceId })
			) {
				return false;
			}
			const candidatePrice = candidate.price as Stripe.Price;
			const stripeProductId = candidateProductIdOf(candidatePrice);
			if (!stripeProductId || !productStripeIds.has(stripeProductId)) {
				return false;
			}
			return stripePriceMatchesFixedPrice({
				stripePrice: candidatePrice,
				price,
				stripeProductId,
				currency: candidatePrice.currency,
			});
		})
		.map((candidate) => candidate.index);
};

/** V1 pack form: per_unit at the pack amount, quantity = packs. Multi-tier
 * configs render as tiered Stripe prices, which unexpanded items can't show. */
const prepaidV1PackShape = ({
	price,
	config,
	stripeProductId,
	currency,
}: {
	price: Price;
	config: UsagePriceConfig;
	stripeProductId: string;
	currency: string;
}): StripePriceShape | null => {
	const recurring = priceToStripeRecurringParams({ price });
	if (!recurring) return null;
	const tiers = config.usage_tiers;
	if (tiers?.length !== 1) return null;
	return inlinePriceToShape({
		price: {
			product: stripeProductId,
			currency,
			billing_scheme: "per_unit",
			recurring,
			unit_amount_decimal: atmnToStripeAmountDecimal({
				amount: tiers[0].amount,
				currency,
			}),
		},
	});
};

const prepaidShapeMatches = ({
	candidatePrice,
	price,
	config,
	entitlement,
	org,
	stripeProductId,
}: {
	candidatePrice: Stripe.Price;
	price: Price;
	config: UsagePriceConfig;
	entitlement?: EntitlementWithFeature;
	org: Organization;
	stripeProductId: string;
}): boolean => {
	if (!candidatePrice.active) return false;
	const currency = candidatePrice.currency;

	// Sub/phase item prices never carry `tiers` unexpanded — only per-unit
	// shapes (V2 allowance-inclusive or V1 pack form) are comparable.
	const expectedShapes: StripePriceShape[] = [];
	const v2Shape = entitlement
		? autumnPrepaidPriceToStripePriceShape({
				price,
				entitlement,
				stripeProductId,
				currency,
				org,
			})
		: null;
	if (v2Shape && !v2Shape.tiers) expectedShapes.push(v2Shape);
	const v1Shape = prepaidV1PackShape({
		price,
		config,
		stripeProductId,
		currency,
	});
	if (v1Shape) expectedShapes.push(v1Shape);
	if (expectedShapes.length === 0) return false;

	const candidateShape = stripePriceToShape({ price: candidatePrice });
	return expectedShapes.some((shape) =>
		stripePriceShapesEqual(candidateShape, shape),
	);
};

/**
 * Structure-agnostic prepaid match: the Stripe price's internals (tiers,
 * per-unit vs flat) are an implementation detail — match the expected total
 * per interval, computed with the same tier math the inline renderer uses.
 */
export const findPrepaidTotalsIndex = ({
	cusEnt,
	org,
	candidates,
	isKnownPriceId,
	isValidCusPriceId,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	org: Organization;
	candidates: ShapeFallbackCandidate[];
	isKnownPriceId: (priceId: string) => boolean;
	isValidCusPriceId: (cusPriceId: string) => boolean;
}): number | undefined => {
	let inlinePrice: StripeInlinePrice;
	try {
		inlinePrice = cusEntToInlineStripePrice({ cusEnt, org });
	} catch {
		return undefined;
	}
	return findInlineTotalsIndex({
		inlinePrice,
		expectedQuantity: 1,
		candidates,
		isKnownPriceId,
		isValidCusPriceId,
	});
};

/**
 * Totals-based match for an inline-rendered id-less price: a licensed item on
 * the same cycle and currency whose quantity × unit amount equals the inline
 * total. Only untagged / stale-tagged candidates; exactly-one semantics.
 */
export const findInlineTotalsIndex = ({
	inlinePrice,
	expectedQuantity,
	candidates,
	isKnownPriceId,
	isValidCusPriceId,
}: {
	inlinePrice: StripeInlinePrice;
	expectedQuantity: number;
	candidates: ShapeFallbackCandidate[];
	isKnownPriceId: (priceId: string) => boolean;
	isValidCusPriceId: (cusPriceId: string) => boolean;
}): number | undefined => {
	const expectedTotal =
		expectedQuantity * Number(inlinePrice.unit_amount_decimal);
	if (!Number.isFinite(expectedTotal)) return undefined;

	const matches = candidates.filter((candidate) => {
		if (!isMatchableByShape({ candidate, isKnownPriceId, isValidCusPriceId })) {
			return false;
		}
		const price = candidate.price as Stripe.Price;
		if (price.currency !== inlinePrice.currency) return false;

		const recurring = inlinePrice.recurring;
		if (recurring) {
			if (price.recurring?.usage_type !== "licensed") return false;
			if (price.recurring.interval !== recurring.interval) return false;
			if (
				(price.recurring.interval_count ?? 1) !==
				(recurring.interval_count ?? 1)
			) {
				return false;
			}
		} else if (price.recurring) {
			return false;
		}

		const unit = price.unit_amount_decimal ?? price.unit_amount?.toString();
		if (unit == null) return false;
		const actualTotal = (candidate.quantity ?? 0) * Number(unit);
		return (
			Number.isFinite(actualTotal) &&
			Math.abs(actualTotal - expectedTotal) <= 0.5
		);
	});

	return matches.length === 1 ? matches[0]?.index : undefined;
};

/**
 * Tier-3 match for a stored expected item whose Stripe price id has drifted
 * (e.g. imported orgs whose subs bill their own historical prices): a
 * same-shape licensed item under one of the plan's Stripe product ids,
 * primary included. Claims a candidate only when exactly one matches.
 */
export const findShapeFallbackIndex = ({
	price,
	product,
	entitlement,
	org,
	candidates,
	isKnownPriceId,
	isValidCusPriceId,
}: {
	price: Price;
	product: Product;
	entitlement?: EntitlementWithFeature;
	org: Organization;
	candidates: ShapeFallbackCandidate[];
	/** Stripe price ids Autumn already resolves by id — id matching owns them. */
	isKnownPriceId: (priceId: string) => boolean;
	/** Metadata tags pointing at live cus prices — tier-1 metadata matching owns them. */
	isValidCusPriceId: (cusPriceId: string) => boolean;
}): number | undefined => {
	const fixed = isFixedPrice(price);
	const prepaidConfig = isPrepaidPrice(price)
		? (price.config as UsagePriceConfig)
		: undefined;
	if (!fixed && !prepaidConfig) return undefined;

	const productStripeIds = new Set(productToStripeIds({ product }));
	// Feature prices live on their own Stripe product, not the plan's.
	if (prepaidConfig?.stripe_product_id) {
		productStripeIds.add(prepaidConfig.stripe_product_id);
	}

	const matches = candidates.filter((candidate) => {
		if (!isMatchableByShape({ candidate, isKnownPriceId, isValidCusPriceId })) {
			return false;
		}

		const candidatePrice = candidate.price as Stripe.Price;
		const stripeProductId = candidateProductIdOf(candidatePrice);
		if (!stripeProductId) return false;

		// Amount + interval identify a base price — the item can live on a
		// legacy Stripe product Autumn never linked.
		if (fixed) {
			return stripePriceMatchesFixedPrice({
				stripePrice: candidatePrice,
				price,
				stripeProductId,
				currency: candidatePrice.currency,
			});
		}
		if (!productStripeIds.has(stripeProductId)) return false;
		if (!prepaidConfig) return false;
		return prepaidShapeMatches({
			candidatePrice,
			price,
			config: prepaidConfig,
			entitlement,
			org,
			stripeProductId,
		});
	});

	return matches.length === 1 ? matches[0]?.index : undefined;
};
