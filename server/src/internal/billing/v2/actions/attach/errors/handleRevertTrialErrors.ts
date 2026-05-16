import { type AttachBillingContext, ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/**
 * Validates attach request when on_end is "revert".
 *
 * Throws if:
 * - No existing customer product to revert to (including cross-entity)
 * - No existing Stripe subscription on the found product
 */
export const handleRevertTrialErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	const { trialContext, currentCustomerProduct } = billingContext;
	if (trialContext?.onEnd !== "revert") return;

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
