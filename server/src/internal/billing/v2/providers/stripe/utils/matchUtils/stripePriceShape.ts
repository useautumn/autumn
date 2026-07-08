import { Decimal } from "decimal.js";
import type Stripe from "stripe";

type InlinePriceLike = {
	product?: string;
	currency?: string;
	billing_scheme?: string;
	tax_behavior?: string | null;
	recurring?: {
		interval?: string;
		interval_count?: number;
		usage_type?: string;
	};
	transform_quantity?: {
		divide_by?: number;
		round?: string;
	} | null;
	unit_amount_decimal?: string | number | null;
	tiers_mode?: string | null;
	tiers?: StripePriceShapeTier[] | null;
};

export type StripePriceShapeTier = {
	upTo?: number | "inf";
	unitAmountDecimal?: string;
	flatAmountDecimal?: string;
};

export type StripePriceShape = {
	product?: string;
	currency?: string;
	billingScheme?: string;
	taxBehavior?: string | null;
	interval?: string;
	intervalCount?: number;
	recurringUsageType?: string | null;
	tiersMode?: string | null;
	tiers?: StripePriceShapeTier[];
	transformQuantity?: string;
	unitAmountDecimal?: string;
};

type StripeItemSnapshotLike = {
	stripe_product_id: string;
	currency: string | null;
	billing_scheme: "per_unit" | "tiered" | null;
	tiers_mode?: "graduated" | "volume" | null;
	tiers?:
		| {
				up_to: number | null;
				unit_amount: number | null;
				flat_amount: number | null;
		  }[]
		| null;
	recurring_interval: Stripe.Price.Recurring.Interval | null;
	recurring_interval_count: number | null;
	unit_amount_decimal: string | null;
};

const stripeProductId = (
	product: string | Stripe.Product | Stripe.DeletedProduct | null,
) => {
	if (!product) return undefined;
	return typeof product === "string" ? product : product.id;
};

export const stripeShapeDecimalAmount = (
	amount: string | number | null | undefined,
) => {
	if (amount === null || amount === undefined) return undefined;
	return new Decimal(amount).toString();
};

const taxBehavior = (value?: string | null) => value ?? "unspecified";

const transformQuantityKey = (
	transformQuantity?: {
		divide_by?: number | null;
		round?: string | null;
	} | null,
) => {
	if (!transformQuantity) return undefined;
	return `${transformQuantity.divide_by ?? ""}:${transformQuantity.round ?? ""}`;
};

const recurringUsageType = (usageType?: string | null) =>
	usageType === "metered" ? usageType : undefined;

const stripeTierAmountDecimal = ({
	decimal,
	amount,
}: {
	decimal?: string | null;
	amount?: number | null;
}) => stripeShapeDecimalAmount(decimal ?? amount ?? undefined);

const stripeTierUpTo = (upTo?: number | "inf" | null) => upTo ?? "inf";

const stripePriceTiersToShape = ({
	tiers,
}: {
	tiers?: Stripe.Price.Tier[] | { data?: Stripe.Price.Tier[] } | null;
}): StripePriceShapeTier[] | undefined => {
	const tierData = Array.isArray(tiers) ? tiers : tiers?.data;
	return tierData?.map((tier) => ({
		upTo: stripeTierUpTo(tier.up_to),
		unitAmountDecimal: stripeTierAmountDecimal({
			decimal: tier.unit_amount_decimal,
			amount: tier.unit_amount,
		}),
		flatAmountDecimal: stripeTierAmountDecimal({
			decimal: tier.flat_amount_decimal,
			amount: tier.flat_amount,
		}),
	}));
};

const inlineTiersToShape = ({
	tiers,
}: {
	tiers?: StripePriceShapeTier[] | null;
}) => tiers ?? undefined;

export const stripePriceToShape = ({
	price,
}: {
	price: Stripe.Price;
}): StripePriceShape => ({
	product: stripeProductId(price.product),
	currency: price.currency,
	billingScheme: price.billing_scheme ?? "per_unit",
	taxBehavior: taxBehavior(price.tax_behavior),
	interval: price.recurring?.interval,
	intervalCount: price.recurring?.interval_count,
	recurringUsageType: recurringUsageType(price.recurring?.usage_type),
	tiersMode: price.tiers_mode ?? undefined,
	tiers: stripePriceTiersToShape({
		tiers: price.tiers as
			| Stripe.Price.Tier[]
			| { data?: Stripe.Price.Tier[] }
			| undefined,
	}),
	transformQuantity: transformQuantityKey(price.transform_quantity),
	unitAmountDecimal: stripeShapeDecimalAmount(
		price.unit_amount_decimal ?? price.unit_amount,
	),
});

export const inlinePriceToShape = ({
	price,
}: {
	price: InlinePriceLike;
}): StripePriceShape => ({
	product: price.product,
	currency: price.currency,
	billingScheme: price.billing_scheme ?? "per_unit",
	taxBehavior: taxBehavior(price.tax_behavior),
	interval: price.recurring?.interval,
	intervalCount: price.recurring?.interval_count,
	recurringUsageType: recurringUsageType(price.recurring?.usage_type),
	tiersMode: price.tiers_mode,
	tiers: inlineTiersToShape({ tiers: price.tiers }),
	transformQuantity: transformQuantityKey(price.transform_quantity),
	unitAmountDecimal: stripeShapeDecimalAmount(price.unit_amount_decimal),
});

export const stripeItemSnapshotToShape = ({
	item,
}: {
	item: StripeItemSnapshotLike;
}): StripePriceShape | null => {
	if (!item.currency) return null;
	if (!item.recurring_interval) return null;

	const isTiered = item.billing_scheme === "tiered" && item.tiers?.length;
	if (!isTiered && !item.unit_amount_decimal) return null;

	return inlinePriceToShape({
		price: {
			product: item.stripe_product_id,
			currency: item.currency,
			billing_scheme: item.billing_scheme ?? "per_unit",
			recurring: {
				interval: item.recurring_interval,
				interval_count: item.recurring_interval_count ?? 1,
			},
			...(isTiered
				? {
						tiers_mode: item.tiers_mode ?? undefined,
						tiers: item.tiers?.map((tier) => ({
							upTo: stripeTierUpTo(tier.up_to),
							unitAmountDecimal: stripeTierAmountDecimal({
								amount: tier.unit_amount,
							}),
							flatAmountDecimal: stripeTierAmountDecimal({
								amount: tier.flat_amount,
							}),
						})),
					}
				: { unit_amount_decimal: item.unit_amount_decimal }),
		},
	});
};

const tiersEqual = ({
	left,
	right,
}: {
	left?: StripePriceShapeTier[];
	right?: StripePriceShapeTier[];
}) => {
	if (!left || !right) return left === right;
	if (left.length !== right.length) return false;

	return left.every((leftTier, index) => {
		const rightTier = right[index];
		if (!rightTier) return false;
		return (
			leftTier.upTo === rightTier.upTo &&
			leftTier.unitAmountDecimal === rightTier.unitAmountDecimal &&
			leftTier.flatAmountDecimal === rightTier.flatAmountDecimal
		);
	});
};

export const stripePriceShapesEqual = (
	left: StripePriceShape,
	right: StripePriceShape,
) =>
	left.product === right.product &&
	left.currency === right.currency &&
	left.billingScheme === right.billingScheme &&
	left.taxBehavior === right.taxBehavior &&
	left.interval === right.interval &&
	left.intervalCount === right.intervalCount &&
	left.recurringUsageType === right.recurringUsageType &&
	left.tiersMode === right.tiersMode &&
	tiersEqual({ left: left.tiers, right: right.tiers }) &&
	left.transformQuantity === right.transformQuantity &&
	left.unitAmountDecimal === right.unitAmountDecimal;
