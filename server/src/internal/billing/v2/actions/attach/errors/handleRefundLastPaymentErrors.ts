import {
	type AttachBillingContext,
	type AttachParamsV1,
	ErrCode,
	isCustomerProductFree,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { attachRefundSourceCustomerProduct } from "@/internal/billing/v2/actions/attach/utils/attachRefundSourceCustomerProduct";

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
	const { refundLastPayment, planTiming } = billingContext;

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

	const refundSource = attachRefundSourceCustomerProduct({ billingContext });

	if (!refundSource) {
		throw refundRejected({
			reason:
				"requires an outgoing plan on the same subscription to refund. This attach does not replace an existing plan.",
		});
	}

	// "prorated" is derived from the refund line items, so a free source simply
	// yields nothing; only "full" would wrongly return the last invoice.
	if (refundLastPayment === "full" && isCustomerProductFree(refundSource)) {
		throw refundRejected({
			reason:
				"requires a paid outgoing plan. The plan being replaced was free, so there is no payment to return.",
		});
	}

	if (refundSource.canceled_at) {
		throw refundRejected({
			reason:
				"cannot refund a plan that is already cancelled, since its payment may have been settled or refunded already.",
		});
	}
};
