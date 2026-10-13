import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";

type TierAmounts = {
	amount?: number | null;
	flat_amount?: number | null;
};

/** Volume tiers priced only by each tier's flat fee: every per-unit amount is 0
 * and at least one tier has a fee. Mixed tiers are per-unit, not flat. */
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
