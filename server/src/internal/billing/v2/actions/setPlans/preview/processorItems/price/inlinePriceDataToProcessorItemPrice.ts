import type { ProcessorItemPrice } from "@autumn/shared";
import { stripeAmountToMajorUnits } from "./stripeAmountToMajorUnits";

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

const inlineUnitAmount = (priceData: InlinePriceData) => {
	if (typeof priceData.unit_amount === "number") return priceData.unit_amount;
	if (priceData.unit_amount_decimal)
		return Number(priceData.unit_amount_decimal);
	return null;
};

export const inlinePriceDataToProcessorItemPrice = (
	priceData: InlinePriceData,
): ProcessorItemPrice => {
	return {
		currency: priceData.currency,
		unit_amount: stripeAmountToMajorUnits({
			amount: inlineUnitAmount(priceData),
			currency: priceData.currency,
		}),
		interval: priceData.recurring?.interval ?? null,
		interval_count: priceData.recurring?.interval_count ?? 1,
		usage_type: "licensed",
		tiers_mode: null,
		tiers: null,
		units_per_quantity: null,
	};
};
