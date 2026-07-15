import { ErrCode, RecaseError } from "@autumn/shared";
import type Stripe from "stripe";
import type { StripeItemSnapshot, StripeItemTier } from "./types";

type SnapshotPriceFields = Omit<
	StripeItemSnapshot,
	"id" | "quantity" | "metadata"
>;

const stripeProductId = ({ price }: { price: Stripe.Price }) =>
	typeof price.product === "string" ? price.product : price.product.id;

const stripeTiers = ({
	tiers,
}: {
	tiers: Stripe.Price.Tier[] | Stripe.Price.CurrencyOptions.Tier[] | null;
}): StripeItemTier[] | null =>
	tiers?.map((tier) => ({
		up_to: tier.up_to,
		unit_amount: tier.unit_amount,
		unit_amount_decimal: tier.unit_amount_decimal,
		flat_amount: tier.flat_amount,
		flat_amount_decimal: tier.flat_amount_decimal,
	})) ?? null;

const effectivePriceValues = ({
	price,
	currency,
}: {
	price: Stripe.Price;
	currency: string;
}) => {
	const normalizedCurrency = currency.toLowerCase();
	const values =
		normalizedCurrency === price.currency.toLowerCase()
			? price
			: price.currency_options?.[normalizedCurrency];
	if (!values) {
		throw new RecaseError({
			message: `Stripe Price '${price.id}' does not support ${normalizedCurrency.toUpperCase()}`,
			code: ErrCode.CurrencyMismatch,
			statusCode: 400,
		});
	}
	return { currency: normalizedCurrency, values };
};

export const stripePriceToSnapshotFields = ({
	price,
	currency,
}: {
	price: Stripe.Price;
	currency: string;
}): SnapshotPriceFields => {
	const effective = effectivePriceValues({ price, currency });
	return {
		stripe_price_id: price.id,
		stripe_product_id: stripeProductId({ price }),
		unit_amount: effective.values.unit_amount ?? null,
		unit_amount_decimal:
			effective.values.unit_amount_decimal ??
			effective.values.unit_amount?.toString() ??
			null,
		currency: effective.currency,
		billing_scheme: price.billing_scheme ?? null,
		tiers_mode: price.tiers_mode ?? null,
		tiers: stripeTiers({ tiers: effective.values.tiers ?? null }),
		recurring_interval: price.recurring?.interval ?? null,
		recurring_interval_count: price.recurring?.interval_count ?? null,
		recurring_usage_type: price.recurring?.usage_type ?? null,
	};
};
