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

const throwInvalidVolumeItem = ({ message }: { message: string }) => {
	throw new RecaseError({
		message,
		code: ErrCode.InvalidInputs,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};

export const validateItemTierBehavior = ({
	item,
	feature,
}: {
	item: ProductItem;
	feature?: Feature;
}) => {
	if (item.tier_behavior !== TierBehavior.VolumeBased) return;

	// Each threshold charge prices its chunk on its own, but a volume band (and its
	// charge on included units) depends on the whole period's usage.
	if (notNullish(item.config?.threshold_billing)) {
		throwInvalidVolumeItem({
			message: `threshold_billing can't be combined with volume-based pricing (feature: ${item.feature_id}): each threshold charge would be priced on its own band. Remove threshold_billing or use graduated pricing.`,
		});
	}

	// Stripe prices allocated seats and bills tier 1's flat fee even at 0 seats;
	// included usage puts a free tier first, so the fee only applies past it.
	const isAllocatedItem =
		item.usage_model === UsageModel.PayPerUse &&
		feature !== undefined &&
		featureUtils.isAllocated(feature);
	const hasFirstTierFlatAmount = (item.tiers?.[0]?.flat_amount ?? 0) > 0;
	const hasIncludedUsage =
		notNullish(item.included_usage) && item.included_usage !== 0;
	if (isAllocatedItem && hasFirstTierFlatAmount && !hasIncludedUsage) {
		throwInvalidVolumeItem({
			message: `Volume-based allocated items can't have a flat_amount on the first tier without included usage (feature: ${item.feature_id}): Stripe would charge it at 0 seats. Add included usage or move the fee to a later tier.`,
		});
	}
};
