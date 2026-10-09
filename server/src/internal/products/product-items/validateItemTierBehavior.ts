import {
	ErrCode,
	notNullish,
	type ProductItem,
	RecaseError,
	TierBehavior,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/** Each threshold charge prices its chunk on its own, but a volume band (and its
 * charge on included units) depends on the whole period's usage. */
export const validateItemTierBehavior = ({ item }: { item: ProductItem }) => {
	const hasVolumeThresholdBilling =
		item.tier_behavior === TierBehavior.VolumeBased &&
		notNullish(item.config?.threshold_billing);
	if (!hasVolumeThresholdBilling) return;

	throw new RecaseError({
		message: `threshold_billing can't be combined with volume-based pricing (feature: ${item.feature_id}): each threshold charge would be priced on its own band. Remove threshold_billing or use graduated pricing.`,
		code: ErrCode.InvalidInputs,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
