import { ErrCode, type ProductItem, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/** Each threshold charge prices its units from zero, so tiers would be mis-priced across charges. */
export const validateItemThresholdBilling = ({
	item,
}: {
	item: ProductItem;
}): void => {
	const hasThresholdBilling = Boolean(item.config?.threshold_billing);
	const hasMultipleTiers = (item.tiers?.length ?? 0) > 1;
	if (!hasThresholdBilling || !hasMultipleTiers) return;

	throw new RecaseError({
		message: `threshold_billing can't be combined with tiered pricing (feature: ${item.feature_id}): each threshold charge restarts the tier count, so tiers would be mis-priced. Use a single price, or remove threshold_billing.`,
		code: ErrCode.InvalidInputs,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
