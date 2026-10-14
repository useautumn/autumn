import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";

type TierAmounts = {
	amount?: number | null;
	flat_amount?: number | null;
};

export const isVolumeFlatFeeTiers = ({
	tierBehavior,
	tiers,
}: {
	tierBehavior?: TierBehavior | `${TierBehavior}` | null;
	tiers?: TierAmounts[] | null;
}): boolean => {
	if (tierBehavior !== TierBehavior.VolumeBased) return false;
	if (!tiers?.length) return false;

	const hasNoUnitAmounts = tiers.every((tier) => !tier.amount);
	const hasFlatFee = tiers.some((tier) => (tier.flat_amount ?? 0) > 0);
	return hasNoUnitAmounts && hasFlatFee;
};
