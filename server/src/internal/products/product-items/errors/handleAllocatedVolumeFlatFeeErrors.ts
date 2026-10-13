import {
	ErrCode,
	type Feature,
	featureUtils,
	type ProductItem,
	RecaseError,
	TierBehavior,
	UsageModel,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/** Stripe bills volume seats over included, and charges tier 1's flat fee even when none are over. */
export const handleAllocatedVolumeFlatFeeErrors = ({
	item,
	feature,
}: {
	item: ProductItem;
	feature?: Feature;
}) => {
	const isAllocatedVolume =
		item.tier_behavior === TierBehavior.VolumeBased &&
		item.usage_model === UsageModel.PayPerUse &&
		feature !== undefined &&
		featureUtils.isAllocated(feature);
	if (!isAllocatedVolume) return;

	const firstTier = item.tiers?.[0];
	const hasFirstTierFlatAmount = [
		firstTier?.flat_amount,
		...(firstTier?.additional_currencies ?? []).map(
			(entry) => entry.flat_amount,
		),
	].some((flatAmount) => (flatAmount ?? 0) > 0);
	if (!hasFirstTierFlatAmount) return;

	throw new RecaseError({
		message: `Volume-based allocated items can't have a flat_amount on the first tier (feature: ${item.feature_id}): Stripe would charge it even with no seats over included. Move the fee to a later tier.`,
		code: ErrCode.InvalidInputs,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
