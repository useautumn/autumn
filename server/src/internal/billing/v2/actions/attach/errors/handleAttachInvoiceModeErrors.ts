import {
	type AttachBillingContext,
	type AttachParamsV1,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isAutumnManagedBillTrialContext } from "@/internal/billing/v2/setup/trialContext/isAutumnManagedBillTrialContext";
import { isDeferredInvoiceMode } from "@/internal/billing/v2/utils/billingContext/isDeferredInvoiceMode";
import { DEFAULT_INVOICE_MODE_NET_TERMS_DAYS } from "@/internal/billing/v2/utils/invoiceMode/invoiceModeDefaults";

/** Only the intent is stored on the trial, so options that differ from the defaults can't reach the invoice sent at trial end. */
const hasCustomInvoiceOptions = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: AttachParamsV1;
}) => {
	const invoiceModeParams = params.invoice_mode;
	const defaultNetTermsDays =
		ctx.org.config.default_invoice_net_terms_days ??
		DEFAULT_INVOICE_MODE_NET_TERMS_DAYS;
	const hasCustomNetTerms =
		invoiceModeParams?.net_terms_days !== undefined &&
		invoiceModeParams.net_terms_days !== defaultNetTermsDays;

	return (
		invoiceModeParams?.finalize === false ||
		invoiceModeParams?.invoice_template_id !== undefined ||
		hasCustomNetTerms
	);
};

/**
 * Validates invoice mode configuration against the attach context.
 *
 * Throws when:
 * - Deferred invoice-mode activation is used for a downgrade
 *   (planTiming="end_of_cycle"): there is no immediate invoice to pay, so deferral makes no sense.
 * - A no-card trial Autumn bills at trial end is combined with custom invoice options
 *   (finalize: false, invoice_template_id, non-default net_terms_days).
 */
export const handleAttachInvoiceModeErrors = ({
	ctx,
	billingContext,
	params,
}: {
	ctx: AutumnContext;
	billingContext: AttachBillingContext;
	params: AttachParamsV1;
}) => {
	const { planTiming, invoiceMode, trialContext } = billingContext;

	const invoicesAtTrialEnd =
		Boolean(invoiceMode) && isAutumnManagedBillTrialContext({ trialContext });
	if (invoicesAtTrialEnd && hasCustomInvoiceOptions({ ctx, params })) {
		throw new RecaseError({
			message:
				"Invoice mode with a no-card free trial sends a finalized invoice with the default invoice settings when the trial ends, so finalize: false, invoice_template_id and custom net_terms_days aren't supported. Drop those options, or require a card for the trial.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

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
