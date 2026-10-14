import { expect } from "bun:test";
import type { InvoicePaymentMethod } from "@autumn/shared";
import type Stripe from "stripe";

const DAY_SECONDS = 86_400;

/** The invoice was sent for payment on the given terms instead of being charged. */
export const expectInvoiceSentOnTerms = ({
	stripeInvoice,
	netTermsDays,
	paymentMethodTypes,
}: {
	stripeInvoice: Stripe.Invoice;
	netTermsDays: number;
	paymentMethodTypes?: InvoicePaymentMethod[];
}) => {
	expect(stripeInvoice.collection_method).toBe("send_invoice");
	expect(stripeInvoice.status).toBe("open");
	const dueInDays =
		(stripeInvoice.due_date! - stripeInvoice.created) / DAY_SECONDS;
	expect(Math.round(dueInDays)).toBe(netTermsDays);
	if (paymentMethodTypes) {
		expect(stripeInvoice.payment_settings.payment_method_types).toEqual(
			paymentMethodTypes,
		);
	}
};
