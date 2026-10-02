import type { ProcessorItemPriceTier } from "@autumn/shared";
import { stripeUnitAmountToMajorUnits } from "./stripeUnitAmountToMajorUnits";

/** A tier as Stripe returns it on a price, or as Autumn sends it when creating one. */
type StripeTier = {
	up_to?: number | "inf" | null;
	unit_amount?: number | null;
	unit_amount_decimal?: string | null;
	flat_amount?: number | null;
	flat_amount_decimal?: string | null;
};

export const stripeTiersToProcessorItemTiers = ({
	tiers,
	currency,
}: {
	tiers: StripeTier[];
	currency: string;
}): ProcessorItemPriceTier[] =>
	tiers.map((tier) => ({
		up_to: typeof tier.up_to === "number" ? tier.up_to : null,
		unit_amount:
			stripeUnitAmountToMajorUnits({ unitAmounts: tier, currency }) ?? 0,
		flat_amount:
			stripeUnitAmountToMajorUnits({
				unitAmounts: {
					unit_amount: tier.flat_amount,
					unit_amount_decimal: tier.flat_amount_decimal,
				},
				currency,
			}) ?? 0,
	}));
