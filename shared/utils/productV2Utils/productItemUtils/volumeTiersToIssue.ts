import { TierBehavior } from "../../../models/productModels/priceModels/priceConfig/usagePriceConfig.js";

/** Validation issue with a volume price's tiers, or null if valid. A single band
 * on a usage-based item would bill every unit once usage passes the included amount. */
export const volumeTiersToIssue = ({
	tierBehavior,
	isPrepaid,
	tierCount,
}: {
	tierBehavior?: TierBehavior | null;
	isPrepaid: boolean;
	tierCount: number;
}): string | null => {
	const isSingleTierUsageBasedVolume =
		tierBehavior === TierBehavior.VolumeBased && !isPrepaid && tierCount <= 1;
	if (!isSingleTierUsageBasedVolume) return null;

	return "Volume-based pricing on a usage-based item needs at least two tiers. Add a tier, or use graduated pricing for a single rate.";
};
