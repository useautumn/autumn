import {
	ErrCode,
	isCustomerProductOneOff,
	RecaseError,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

export const handleUpdateSubscriptionBillingCycleAnchorErrors = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}) => {
	const { requestedBillingCycleAnchor } = billingContext;
	if (requestedBillingCycleAnchor === undefined) return;

	if (billingContext.trialContext?.trialEndsAt) {
		throw new RecaseError({
			message: "billing_cycle_anchor cannot be used together with a free trial",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (isCustomerProductOneOff(billingContext.customerProduct)) {
		throw new RecaseError({
			message: "billing_cycle_anchor is not supported for one-off products",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (billingContext.cancelAction) {
		throw new RecaseError({
			message:
				"billing_cycle_anchor cannot be used together with a cancel action",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (billingContext.intent === UpdateSubscriptionIntent.UpdateQuantity) {
		throw new RecaseError({
			message:
				"billing_cycle_anchor cannot be used together with feature_quantities",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
