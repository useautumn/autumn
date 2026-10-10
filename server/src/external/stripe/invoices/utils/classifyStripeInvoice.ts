import type Stripe from "stripe";

export const isFirstSubscriptionInvoice = (invoice: Stripe.Invoice): boolean =>
	invoice.billing_reason === "subscription_create";

export const isStripeInvoiceForNewPeriod = (stripeInvoice: Stripe.Invoice) => {
	return stripeInvoice.billing_reason === "subscription_cycle";
};

export const hasStripeInvoicePayment = (stripeInvoice: Stripe.Invoice) =>
	stripeInvoice.amount_paid > 0;

export const isStripeInvoicePendingPaymentError = (error: unknown): boolean =>
	error instanceof Error &&
	(error.message.includes("pending payments waiting to clear") ||
		error.message.includes("a payment on it is still pending"));
