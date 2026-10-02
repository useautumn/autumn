import type { ProcessorItemPrice } from "@autumn/shared";
import type Stripe from "stripe";
import { stripeTiersToProcessorItemTiers } from "./stripeTiersToProcessorItemTiers";
import { stripeUnitAmountToMajorUnits } from "./stripeUnitAmountToMajorUnits";

export const stripePriceToProcessorItemPrice = (
	stripePrice: Stripe.Price,
): ProcessorItemPrice => {
	const { currency } = stripePrice;
	const isTiered = stripePrice.billing_scheme === "tiered";

	return {
		currency,
		unit_amount: isTiered
			? null
			: stripeUnitAmountToMajorUnits({ unitAmounts: stripePrice, currency }),
		interval: stripePrice.recurring?.interval ?? null,
		interval_count: stripePrice.recurring?.interval_count ?? 1,
		usage_type: stripePrice.recurring?.usage_type ?? "licensed",
		tiers_mode: isTiered ? (stripePrice.tiers_mode ?? null) : null,
		tiers:
			isTiered && stripePrice.tiers
				? stripeTiersToProcessorItemTiers({
						tiers: stripePrice.tiers,
						currency,
					})
				: null,
		units_per_quantity: stripePrice.transform_quantity?.divide_by ?? null,
	};
};
