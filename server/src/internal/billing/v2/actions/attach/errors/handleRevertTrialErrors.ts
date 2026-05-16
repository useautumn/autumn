import {
	type AttachBillingContext,
	ErrCode,
	hasActivePaidSubscription,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/**
 * Validates attach request when on_end is "revert".
 *
 * Throws if the customer has no active paid subscription anywhere
 * (across all entities).
 */
export const handleRevertTrialErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	const { trialContext, fullCustomer } = billingContext;
	if (trialContext?.onEnd !== "revert") return;

	if (
		!hasActivePaidSubscription({
			customerProducts: fullCustomer.customer_products,
		})
	) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message:
				"Cannot use on_end: 'revert' without an existing paid subscription.",
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
