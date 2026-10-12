import type { VolumeTierPricing } from "@utils/productUtils/priceUtils/convertPrice/tiersToVolumeTierPricing";
import { numberWithCommas } from "../../displayUtils";

const PRICING_RULES: Record<VolumeTierPricing, string> = {
	per_unit: "all units at the reached tier's rate",
	flat_fee: "the reached tier's flat fee",
	per_unit_and_flat_fee:
		"all units at the reached tier's rate plus its flat fee",
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
