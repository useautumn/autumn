import {
	ErrCode,
	type ProductItem,
	RecaseError,
	UsageModel,
} from "@autumn/shared";
import { isSingleTierUsageBasedVolume } from "@autumn/shared/utils/productUtils/priceUtils/classifyPrice/isSingleTierUsageBasedVolume";
import { StatusCodes } from "http-status-codes";

export const handleSingleTierVolumeErrors = ({
	item,
}: {
	item: ProductItem;
}) => {
	const isSingleTierVolume = isSingleTierUsageBasedVolume({
		tierBehavior: item.tier_behavior,
		isPrepaid: item.usage_model === UsageModel.Prepaid,
		tierCount: item.tiers?.length ?? 1,
	});
	if (!isSingleTierVolume) return;

	throw new RecaseError({
		message:
			"Volume-based pricing on a usage-based item needs at least two tiers. Add a tier, or use graduated pricing for a single rate.",
		code: ErrCode.InvalidInputs,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
