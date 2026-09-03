import {
	type AttachBillingContext,
	type AttachParamsV1,
	ErrCode,
	isCustomerProductFree,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

const refundRejected = ({ reason }: { reason: string }) =>
	new RecaseError({
		message: `refund_last_payment ${reason}`,
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});

/**
 * Rejects refund requests that could not be paid out, so the caller hears about
 * it instead of the option being silently dropped.
 */
export const handleRefundLastPaymentErrors = ({
	billingContext,
	params,
}: {
	billingContext: AttachBillingContext;
	params: AttachParamsV1;
}) => {
	const { refundLastPayment, planTiming, currentCustomerProduct } =
		billingContext;

	if (!refundLastPayment) return;

	if (params.no_billing_changes === true) {
		throw refundRejected({
			reason:
				"cannot be combined with no_billing_changes, which skips the billing changes the refund depends on.",
		});
	}

	// A downgrade resolves to end_of_cycle unless plan_schedule says otherwise.
	if (planTiming === "end_of_cycle") {
		throw refundRejected({
			reason:
				"requires an immediate plan switch. This attach resolves to an end-of-cycle switch, so the outgoing plan stays active until the cycle ends and its payment cannot be refunded. Pass plan_schedule: 'immediate' to switch and refund now.",
		});
	}

	if (!currentCustomerProduct) {
		throw refundRejected({
			reason:
				"requires an outgoing plan to refund. This attach does not replace an existing plan.",
		});
	}

	if (isCustomerProductFree(currentCustomerProduct)) {
		throw refundRejected({
			reason:
				"requires a paid outgoing plan. The plan being replaced was free, so there is no payment to return.",
		});
	}
};
