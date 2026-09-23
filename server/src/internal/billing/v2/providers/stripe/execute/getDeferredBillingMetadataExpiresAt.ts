import { ms } from "@autumn/shared";
import type Stripe from "stripe";

const finalizedInvoiceDueDateMs = (stripeInvoice?: Stripe.Invoice) => {
	if (stripeInvoice?.status !== "open" || !stripeInvoice.due_date) return null;
	return stripeInvoice.due_date * 1000;
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

	if (deferredInvoiceMode) return finalizedInvoiceDueDateMs(stripeInvoice);

	return now + ms.minutes(10);
};
