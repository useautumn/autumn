import {
	cusProductToPrices,
	ErrCode,
	isOneOffProduct,
	RecaseError,
	type UpdateSubscriptionBillingContext,
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
			message:
				"billing_cycle_anchor cannot be used together with a free trial. The trial already controls the billing cycle start.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const prices = cusProductToPrices({
		cusProduct: billingContext.customerProduct,
	});

	if (isOneOffProduct({ prices })) {
		throw new RecaseError({
			message:
				"billing_cycle_anchor is not supported for one-off products. One-off products do not have a recurring billing cycle.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
