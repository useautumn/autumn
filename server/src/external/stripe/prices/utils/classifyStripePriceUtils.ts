import type Stripe from "stripe";

const isPositive = (
	amount: number | null | undefined,
	amountDecimal?: string | null,
): boolean => (amount ?? Number(amountDecimal ?? 0)) > 0;

export const stripePriceCanBill = ({
	stripePrice,
}: {
	stripePrice?: Stripe.Price;
}): boolean => {
	if (!stripePrice) return false;

	if (stripePrice.billing_scheme === "tiered") {
		const tiers = stripePrice.tiers;
		if (!tiers?.length) return true;
		return tiers.some(
			(tier) =>
				isPositive(tier.unit_amount, tier.unit_amount_decimal) ||
				isPositive(tier.flat_amount, tier.flat_amount_decimal),
		);
	}

	return isPositive(stripePrice.unit_amount, stripePrice.unit_amount_decimal);
};
