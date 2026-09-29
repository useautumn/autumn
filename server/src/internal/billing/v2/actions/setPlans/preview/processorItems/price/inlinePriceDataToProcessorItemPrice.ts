import type { ProcessorItemPrice } from "@autumn/shared";
import { stripeUnitAmountToMajorUnits } from "./stripeUnitAmountToMajorUnits";

/** The shared shape of `price_data` on subscription, schedule and checkout items. */
export type InlinePriceData = {
	currency: string;
	unit_amount?: number | null;
	unit_amount_decimal?: string | null;
	recurring?: {
		interval: "day" | "week" | "month" | "year";
		interval_count?: number;
	} | null;
};

export const inlinePriceDataToProcessorItemPrice = (
	priceData: InlinePriceData,
): ProcessorItemPrice => {
	return {
		currency: priceData.currency,
		unit_amount: stripeUnitAmountToMajorUnits({
			unitAmounts: priceData,
			currency: priceData.currency,
		}),
		interval: priceData.recurring?.interval ?? null,
		interval_count: priceData.recurring?.interval_count ?? 1,
		usage_type: "licensed",
		tiers_mode: null,
		first_tier_amount: null,
		units_per_quantity: null,
	};
};
