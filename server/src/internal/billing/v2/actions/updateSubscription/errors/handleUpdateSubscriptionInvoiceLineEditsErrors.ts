import {
	type BillingPlan,
	ErrCode,
	RecaseError,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { handleInvoiceLineEditsErrors } from "@/internal/billing/v2/common/errors/handleInvoiceLineEditsErrors";

const invalidRequest = (message: string) =>
	new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});

export const handleUpdateSubscriptionInvoiceLineEditsErrors = ({
	params,
	billingContext,
	billingPlan,
}: {
	params: UpdateSubscriptionV1Params;
	billingContext: UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
}) => {
	if (!billingContext.invoiceLineEdits) return;

	if (params.refund_last_payment) {
		throw invalidRequest(
			"add_lines and remove_lines can't be combined with refund_last_payment",
		);
	}

	if (params.cancel_action) {
		throw invalidRequest(
			"add_lines and remove_lines can't be combined with cancel_action",
		);
	}

	handleInvoiceLineEditsErrors({ params, billingContext, billingPlan });
};
