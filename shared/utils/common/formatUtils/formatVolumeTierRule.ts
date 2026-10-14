import type { VolumeTierPricing } from "@utils/productUtils/priceUtils/convertPrice/tiersToVolumeTierPricing";
import { numberWithCommas } from "../../displayUtils";

const PRICING_RULES: Record<VolumeTierPricing, string> = {
	per_unit: "usage billed at the reached tier's rate",
	flat_fee: "the reached tier's flat fee",
	per_unit_and_flat_fee:
		"usage billed at the reached tier's rate plus its flat fee",
};

export const formatVolumeTierRule = ({
	includedUsage,
	pricing,
}: {
	includedUsage?: number | null;
	pricing: VolumeTierPricing;
}): string => {
	const rule = PRICING_RULES[pricing];
	if (!includedUsage || includedUsage <= 0) return `volume: ${rule}`;

	return `volume: past ${numberWithCommas(includedUsage)}, ${rule}`;
};
