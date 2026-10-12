import {
	ErrCode,
	type Feature,
	featureUtils,
	notNullish,
	type ProductItem,
	RecaseError,
	TierBehavior,
	UsageModel,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/** Stripe prices allocated seats and bills tier 1's flat fee even at 0 seats;
 * included usage puts a free tier first, so the fee only applies past it. */
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

	const hasFirstTierFlatAmount = (item.tiers?.[0]?.flat_amount ?? 0) > 0;
	const hasIncludedUsage =
		notNullish(item.included_usage) && item.included_usage !== 0;
	if (!hasFirstTierFlatAmount || hasIncludedUsage) return;

	throw new RecaseError({
		message: `Volume-based allocated items can't have a flat_amount on the first tier without included usage (feature: ${item.feature_id}): Stripe would charge it at 0 seats. Add included usage or move the fee to a later tier.`,
		code: ErrCode.InvalidInputs,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
