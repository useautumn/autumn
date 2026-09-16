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
 * Throws when:
 * - Deferred invoice-mode activation is used for a downgrade
 *   (planTiming="end_of_cycle"): there is no immediate invoice to pay, so deferral makes no sense.
 * - A no-card trial (card_required: false) is combined with invoice mode. Stripe rejects
 *   `trial_settings.end_behavior.missing_payment_method: "cancel"` together with
 *   `collection_method: "send_invoice"`, so we fail early with a clear message instead of
 *   surfacing the raw Stripe error at execution time (preview would otherwise pass).
 */
export const handleAttachInvoiceModeErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	const { planTiming, invoiceMode, trialContext } = billingContext;

	// Check: Invoice mode + no-card trial (revert trials never touch Stripe, so they're fine)
	const isNoCardTrial =
		trialContext?.cardRequired === false && trialContext.onEnd !== "revert";
	if (invoiceMode && isNoCardTrial) {
		throw new RecaseError({
			message:
				"Cannot use invoice mode with a no-card free trial (card_required: false). Either require a card for the trial, or drop invoice mode.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	// Check: Invoice mode deferred + downgrade (scheduled plan)
	if (
		isDeferredInvoiceMode({ billingContext }) &&
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
