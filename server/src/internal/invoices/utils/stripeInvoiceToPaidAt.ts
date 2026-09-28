import { secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";

export const stripeInvoiceToPaidAt = ({
	stripeInvoice,
}: {
	stripeInvoice: Stripe.Invoice;
}): number | null => {
	const paidAtSeconds = stripeInvoice.status_transitions?.paid_at;
	return paidAtSeconds ? secondsToMs(paidAtSeconds) : null;
};
