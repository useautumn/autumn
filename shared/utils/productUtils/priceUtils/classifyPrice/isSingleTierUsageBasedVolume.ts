import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";

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
