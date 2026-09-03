import {
	type AttachBillingContext,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/**
 * Validates that a requested refund can actually be paid out.
 *
 * A downgrade defaults to "end_of_cycle" when no plan_schedule is passed, so
 * the schema alone cannot catch this — the outgoing plan stays active until the
 * cycle ends, and no refund would be issued.
 */
export const handleRefundLastPaymentErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	const { refundLastPayment, planTiming } = billingContext;

	if (!refundLastPayment) return;

	if (planTiming === "end_of_cycle") {
		throw new RecaseError({
			message:
				"refund_last_payment requires an immediate plan switch. This attach resolves to an end-of-cycle switch, so the outgoing plan stays active until the cycle ends and its payment cannot be refunded. Pass plan_schedule: 'immediate' to switch and refund now.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
