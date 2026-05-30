import type Stripe from "stripe";

type InlinePriceLike = {
	product?: string;
	currency?: string;
	recurring?: {
		interval?: string;
		interval_count?: number;
	};
	unit_amount_decimal?: string | number | null;
};

export type StripePriceShape = {
	product?: string;
	currency?: string;
	interval?: string;
	intervalCount?: number;
	unitAmountDecimal?: string;
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

export const stripePriceToShape = ({
	price,
}: {
	price: Stripe.Price;
}): StripePriceShape => ({
	product: stripeProductId(price.product),
	currency: price.currency,
	interval: price.recurring?.interval,
	intervalCount: price.recurring?.interval_count,
	unitAmountDecimal: decimalAmount(price.unit_amount_decimal),
});

export const inlinePriceToShape = ({
	price,
}: {
	price: InlinePriceLike;
}): StripePriceShape => ({
	product: price.product,
	currency: price.currency,
	interval: price.recurring?.interval,
	intervalCount: price.recurring?.interval_count,
	unitAmountDecimal: decimalAmount(price.unit_amount_decimal),
});

export const stripePriceShapesEqual = (
	left: StripePriceShape,
	right: StripePriceShape,
) =>
	left.product === right.product &&
	left.currency === right.currency &&
	left.interval === right.interval &&
	left.intervalCount === right.intervalCount &&
	left.unitAmountDecimal === right.unitAmountDecimal;
