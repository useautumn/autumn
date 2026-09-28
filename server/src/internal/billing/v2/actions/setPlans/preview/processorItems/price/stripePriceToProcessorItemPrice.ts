import type { ProcessorItemPrice } from "@autumn/shared";
import type Stripe from "stripe";
import { inlineUnitAmount } from "./inlinePriceDataToProcessorItemPrice";
import { stripeAmountToMajorUnits } from "./stripeAmountToMajorUnits";

const stripeTierToProcessorItemTier = ({
	tier,
	currency,
}: {
	tier: Stripe.Price.Tier;
	currency: string;
}) => ({
	up_to: tier.up_to,
	unit_amount: stripeAmountToMajorUnits({
		amount: inlineUnitAmount(tier),
		currency,
	}),
	flat_amount: stripeAmountToMajorUnits({ amount: tier.flat_amount, currency }),
});

export const stripePriceToProcessorItemPrice = (
	stripePrice: Stripe.Price,
): ProcessorItemPrice => {
	const { currency } = stripePrice;
	const isTiered = stripePrice.billing_scheme === "tiered";

	return {
		currency,
		unit_amount: isTiered
			? null
			: stripeAmountToMajorUnits({
					amount: inlineUnitAmount(stripePrice),
					currency,
				}),
		interval: stripePrice.recurring?.interval ?? null,
		interval_count: stripePrice.recurring?.interval_count ?? 1,
		usage_type: stripePrice.recurring?.usage_type ?? "licensed",
		tiers_mode: isTiered ? (stripePrice.tiers_mode ?? null) : null,
		tiers: isTiered
			? (stripePrice.tiers ?? []).map((tier) =>
					stripeTierToProcessorItemTier({ tier, currency }),
				)
			: null,
		units_per_quantity: stripePrice.transform_quantity?.divide_by ?? null,
	};
};
