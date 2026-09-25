import { addMinutes, fromUnixTime } from "date-fns";
import type Stripe from "stripe";

const DEFERRED_METADATA_EXPIRY_MINUTES = 10;

const finalizedInvoiceDueDateMs = (stripeInvoice?: Stripe.Invoice) => {
	if (stripeInvoice?.status !== "open" || !stripeInvoice.due_date) return null;
	return fromUnixTime(stripeInvoice.due_date).getTime();
};

export const getDeferredBillingMetadataExpiresAt = ({
	deferredInvoiceMode,
	paymentMethod,
	stripeInvoice,
	now = Date.now(),
}: {
	deferredInvoiceMode: boolean;
	paymentMethod?: { type?: string } | null;
	stripeInvoice?: Stripe.Invoice;
	now?: number;
}) => {
	if (paymentMethod?.type === "custom") return null;

	// A draft has no due date: its plan waits until the invoice is finalized or voided.
	if (stripeInvoice?.status === "draft") return null;

	if (deferredInvoiceMode) return finalizedInvoiceDueDateMs(stripeInvoice);

	return addMinutes(now, DEFERRED_METADATA_EXPIRY_MINUTES).getTime();
};
