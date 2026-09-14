import {
	type BillingPlan,
	ErrCode,
	isCustomerProductOneOff,
	RecaseError,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { handleCustomLineItemsErrors } from "@/internal/billing/v2/common/errors/handleCustomLineItemsErrors.js";

export const handleUpdateSubscriptionCustomLineItemsErrors = ({
	params,
	billingContext,
	billingPlan,
}: {
	params: UpdateSubscriptionV1Params;
	billingContext: UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
}) => {
	if (!params.custom_line_items?.length) return;

	if (params.refund_last_payment) {
		throw new RecaseError({
			message:
				"custom_line_items cannot be used together with refund_last_payment",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (params.cancel_action) {
		throw new RecaseError({
			message: "custom_line_items cannot be used together with cancel_action",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (isCustomerProductOneOff(billingContext.customerProduct)) {
		throw new RecaseError({
			message: "custom_line_items is not supported for one-off products",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	handleCustomLineItemsErrors({ params, billingContext, billingPlan });
};
