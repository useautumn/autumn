import type { UsageTier } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { Infinite } from "@models/productModels/productEnums";

/**
 * Find the volume-tier that covers the given quantity. Walks tiers in order
 * and returns the first one whose `to` is ≥ quantity (or the final Infinite
 * tier). Returns undefined only if no Infinite tier exists and quantity
 * exceeds every bound — tier shapes are expected to end with `to: Infinite`,
 * so this is rare.
 */
export const findTierByQuantity = ({
	tiers,
	quantity,
}: {
	tiers: UsageTier[];
	quantity: number;
}): UsageTier | undefined => {
	for (const tier of tiers) {
		if (tier.to === Infinite || tier.to === -1) return tier;
		if (typeof tier.to === "number" && quantity <= tier.to) return tier;
	}
	return undefined;
};
