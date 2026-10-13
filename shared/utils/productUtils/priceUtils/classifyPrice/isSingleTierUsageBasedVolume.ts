import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";

/** A single volume band on a usage-based price bills every unit once usage passes the included amount. */
export const isSingleTierUsageBasedVolume = ({
	tierBehavior,
	isPrepaid,
	tierCount,
}: {
	tierBehavior?: TierBehavior | null;
	isPrepaid: boolean;
	tierCount: number;
}): boolean =>
	tierBehavior === TierBehavior.VolumeBased && !isPrepaid && tierCount <= 1;
