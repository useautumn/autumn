import { type AttachBillingContext, ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/**
 * Validates attach request when on_end is "revert".
 *
 * Throws if:
 * - card_required is true (card collected but never used)
 * - No existing customer product to revert to
 * - No existing Stripe subscription on the current product
 */
export const handleRevertTrialErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	const { trialContext, currentCustomerProduct } = billingContext;
	if (trialContext?.onEnd !== "revert") return;

	if (trialContext.cardRequired) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message:
				"Cannot use on_end: 'revert' with card_required: true. A card would be collected but never charged.",
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (!currentCustomerProduct) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message:
				"Cannot use on_end: 'revert' without an existing plan to revert to.",
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (!currentCustomerProduct.subscription_ids?.length) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message:
				"Cannot use on_end: 'revert' without an existing Stripe subscription.",
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
