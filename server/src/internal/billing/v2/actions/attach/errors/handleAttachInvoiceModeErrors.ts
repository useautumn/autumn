import {
	type AttachBillingContext,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/**
 * Validates invoice mode configuration against the attach context.
 *
 * Throws error when:
 * - Invoice mode with deferred activation (enableProductImmediately=false) is used for a downgrade
 *   (planTiming="end_of_cycle"). Downgrades are scheduled for end of cycle and have no immediate
 *   invoice to pay, so deferred activation makes no sense.
 */
export const handleAttachInvoiceModeErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	const { invoiceMode, planTiming } = billingContext;

	// Check: Invoice mode deferred + downgrade (scheduled plan)
	if (
		invoiceMode?.enableProductImmediately === false &&
		planTiming === "end_of_cycle"
	) {
		throw new RecaseError({
			message:
				"Cannot use invoice mode with deferred activation for downgrades. Downgrades are scheduled for end of cycle and have no immediate invoice to pay.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
