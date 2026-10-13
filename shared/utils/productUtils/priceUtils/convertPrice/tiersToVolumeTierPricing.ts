import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { isVolumeFlatFeeTiers } from "@utils/productUtils/priceUtils/classifyPrice/isVolumeFlatFeeTiers";

export type VolumeTierPricing =
	| "per_unit"
	| "flat_fee"
	| "per_unit_and_flat_fee";

export const tiersToVolumeTierPricing = ({
	tiers,
}: {
	tiers: { amount?: number | null; flat_amount?: number | null }[];
}): VolumeTierPricing => {
	if (isVolumeFlatFeeTiers({ tierBehavior: TierBehavior.VolumeBased, tiers })) {
		return "flat_fee";
	}
	const hasFlatFee = tiers.some((tier) => (tier.flat_amount ?? 0) > 0);
	return hasFlatFee ? "per_unit_and_flat_fee" : "per_unit";
};
