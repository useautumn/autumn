import type { UsageTier } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { Infinite } from "@models/productModels/productEnums";

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
