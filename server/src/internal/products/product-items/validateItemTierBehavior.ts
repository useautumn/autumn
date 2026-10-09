import {
	ErrCode,
	type ProductItem,
	RecaseError,
	TierBehavior,
	UsageModel,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { isFeaturePriceItem } from "./productItemUtils/getItemType";

/** Volume pricing is prepaid-only for now. Billing paths still accept persisted
 * single-tier pay-per-use volume items, which predate the single-tier check. */
export const validateItemTierBehavior = ({
	item,
	validateAuthoringRules,
}: {
	item: ProductItem;
	validateAuthoringRules: boolean;
}) => {
	const isPayPerUseVolume =
		isFeaturePriceItem(item) &&
		item.tier_behavior === TierBehavior.VolumeBased &&
		item.usage_model !== UsageModel.Prepaid;
	if (!isPayPerUseVolume) return;

	const isPersistedSingleTier =
		(item.tiers?.length ?? 1) <= 1 && !validateAuthoringRules;
	if (isPersistedSingleTier) return;

	throw new RecaseError({
		message: `Volume-based pricing is only supported for prepaid items (feature: ${item.feature_id}). Set usage_model to prepaid, or remove tier_behavior.`,
		code: ErrCode.InvalidInputs,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
