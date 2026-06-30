import {
	atmnToStripeAmountDecimal,
	type FixedPriceConfig,
	type Price,
} from "@autumn/shared";
import { priceToStripeRecurringParams } from "@utils/productUtils/priceUtils/convertPrice/priceToStripeRecurringParams";
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
	unit_amount_decimal?: string | number | null;
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

type StripeItemSnapshotLike = {
	stripe_product_id: string;
	currency: string | null;
	billing_scheme: "per_unit" | "tiered" | null;
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

const decimalAmount = (amount: string | number | null | undefined) => {
	if (amount === null || amount === undefined) return undefined;
	return String(amount);
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
	unitAmountDecimal: decimalAmount(price.unit_amount_decimal),
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
	unitAmountDecimal: decimalAmount(price.unit_amount_decimal),
});

export const stripeItemSnapshotToShape = ({
	item,
}: {
	item: StripeItemSnapshotLike;
}): StripePriceShape | null => {
	if (!item.currency) return null;
	if (!item.recurring_interval) return null;
	if (!item.unit_amount_decimal) return null;

	return inlinePriceToShape({
		price: {
			product: item.stripe_product_id,
			currency: item.currency,
			billing_scheme: item.billing_scheme ?? "per_unit",
			recurring: {
				interval: item.recurring_interval,
				interval_count: item.recurring_interval_count ?? 1,
			},
			unit_amount_decimal: item.unit_amount_decimal,
		},
	});
};

export const autumnBasePriceToStripePriceShape = ({
	price,
	stripeProductId,
	currency,
}: {
	price: Price & { config: FixedPriceConfig };
	stripeProductId: string;
	currency: string;
}): StripePriceShape | null => {
	const recurring = priceToStripeRecurringParams({ price });
	if (!recurring) return null;

	return inlinePriceToShape({
		price: {
			product: stripeProductId,
			currency,
			billing_scheme: "per_unit",
			recurring,
			unit_amount_decimal: atmnToStripeAmountDecimal({
				amount: price.config.amount,
				currency,
			}),
		},
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
	left.tiersMode === right.tiersMode &&
	left.transformQuantity === right.transformQuantity &&
	left.unitAmountDecimal === right.unitAmountDecimal;
