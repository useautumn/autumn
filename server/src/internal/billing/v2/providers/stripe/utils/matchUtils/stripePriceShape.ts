import type { StripeDecimal } from "@autumn/shared";
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
	};
	transform_quantity?: {
		divide_by?: number;
		round?: string;
	} | null;
	unit_amount_decimal?: string | number | StripeDecimal | null;
};

export type StripePriceShape = {
	product?: string;
	currency?: string;
	billingScheme?: string;
	taxBehavior?: string | null;
	interval?: string;
	intervalCount?: number;
	tiersMode?: string | null;
	transformQuantity?: string;
	unitAmountDecimal?: string;
};

const stripeProductId = (
	product: string | Stripe.Product | Stripe.DeletedProduct | null,
) => {
	if (!product) return undefined;
	return typeof product === "string" ? product : product.id;
};

// Numeric normalization so "100.00" and "100" produce the same shape key.
const decimalAmount = (amount: string | number | null | undefined) => {
	if (amount === null || amount === undefined) return undefined;
	return new Decimal(String(amount)).toString();
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
	tiersMode: price.tiers_mode ?? undefined,
	transformQuantity: transformQuantityKey(price.transform_quantity),
	unitAmountDecimal: decimalAmount(price.unit_amount_decimal?.toString()),
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
	transformQuantity: transformQuantityKey(price.transform_quantity),
	unitAmountDecimal: decimalAmount(price.unit_amount_decimal?.toString()),
});

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
	left.tiersMode === right.tiersMode &&
	left.transformQuantity === right.transformQuantity &&
	left.unitAmountDecimal === right.unitAmountDecimal;
