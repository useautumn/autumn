import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { isVolumeFlatFeeTiers } from "@utils/productUtils/priceUtils/classifyPrice/isVolumeFlatFeeTiers";
import { numberWithCommas } from "../../displayUtils";

export type VolumeTierPricing =
	| "per_unit"
	| "flat_fee"
	| "per_unit_and_flat_fee";

const PRICING_RULES: Record<VolumeTierPricing, string> = {
	per_unit: "all units at the reached tier's rate",
	flat_fee: "the reached tier's flat fee",
	per_unit_and_flat_fee:
		"all units at the reached tier's rate plus its flat fee",
};

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

/** Volume picks one tier from total usage; past the included amount every unit
 * is charged at that tier, so the copy names the included threshold. */
export const formatVolumeTierRule = ({
	includedUsage,
	pricing,
}: {
	includedUsage?: number | null;
	pricing: VolumeTierPricing;
}): string => {
	const threshold =
		includedUsage && includedUsage > 0
			? `past ${numberWithCommas(includedUsage)}, `
			: "";
	return `volume: ${threshold}${PRICING_RULES[pricing]}`;
};
