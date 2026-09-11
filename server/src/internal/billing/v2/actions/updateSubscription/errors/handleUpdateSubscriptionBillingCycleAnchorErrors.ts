import {
	ErrCode,
	isCustomerProductOneOff,
	RecaseError,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { assertFutureBillingCycleAnchor } from "@/internal/billing/v2/common/errors/assertFutureBillingCycleAnchor";

export const handleUpdateSubscriptionBillingCycleAnchorErrors = ({
	billingContext,
	params,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV1Params;
}) => {
	const { requestedBillingCycleAnchor } = billingContext;
	if (requestedBillingCycleAnchor === undefined) return;

	assertFutureBillingCycleAnchor({
		requestedBillingCycleAnchor,
		currentEpochMs: billingContext.currentEpochMs,
	});

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
		const conflictingParam = params.license_quantities?.length
			? "license_quantities"
			: "feature_quantities";
		throw new RecaseError({
			message: `billing_cycle_anchor cannot be used together with ${conflictingParam}`,
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
