import type { ProcessorItemPrice } from "@autumn/shared";
import type Stripe from "stripe";
import { stripeUnitAmountToMajorUnits } from "./stripeUnitAmountToMajorUnits";

export const stripePriceToProcessorItemPrice = (
	stripePrice: Stripe.Price,
): ProcessorItemPrice => {
	const { currency } = stripePrice;
	const isTiered = stripePrice.billing_scheme === "tiered";
	const firstTier = stripePrice.tiers?.[0];

	return {
		currency,
		unit_amount: isTiered
			? null
			: stripeUnitAmountToMajorUnits({ unitAmounts: stripePrice, currency }),
		interval: stripePrice.recurring?.interval ?? null,
		interval_count: stripePrice.recurring?.interval_count ?? 1,
		usage_type: stripePrice.recurring?.usage_type ?? "licensed",
		tiers_mode: isTiered ? (stripePrice.tiers_mode ?? null) : null,
		first_tier_amount:
			isTiered && firstTier
				? stripeUnitAmountToMajorUnits({ unitAmounts: firstTier, currency })
				: null,
		units_per_quantity: stripePrice.transform_quantity?.divide_by ?? null,
	};
};
