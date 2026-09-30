import { ErrCode, RecaseError } from "@autumn/shared";
import type Stripe from "stripe";

/** A reissued invoice is superseded; finalizing or paying it would bill the customer twice. */
export const assertInvoiceNotReissued = ({
	invoiceId,
	stripeInvoice,
}: {
	invoiceId: string;
	stripeInvoice: Stripe.Invoice;
}) => {
	const replacementId = stripeInvoice.metadata?.autumn_reissued_to;
	if (!replacementId || stripeInvoice.status === "paid") return;

	throw new RecaseError({
		message: `Invoice ${invoiceId} was reissued as Stripe invoice ${replacementId}; use the replacement instead`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
