import {
	type AttachBillingContext,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { isDeferredInvoiceMode } from "@/internal/billing/v2/utils/billingContext/isDeferredInvoiceMode";

/**
 * Validates invoice mode configuration against the attach context.
 *
 * Throws when deferred invoice-mode activation is used for a downgrade
 * (planTiming="end_of_cycle"): there is no immediate invoice to pay, so deferral makes no sense.
 */
export const handleAttachInvoiceModeErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	const { planTiming } = billingContext;

	// Check: Invoice mode deferred + downgrade (scheduled plan)
	if (isDeferredInvoiceMode({ billingContext }) && planTiming === "end_of_cycle") {
		throw new RecaseError({
			message:
				"Cannot use invoice mode with deferred activation for downgrades. Downgrades are scheduled for end of cycle and have no immediate invoice to pay.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
