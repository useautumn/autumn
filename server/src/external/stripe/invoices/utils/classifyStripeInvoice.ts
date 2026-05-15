import type Stripe from "stripe";

export const isFirstSubscriptionInvoice = (invoice: Stripe.Invoice): boolean =>
	invoice.billing_reason === "subscription_create";

export const isStripeInvoiceForNewPeriod = (stripeInvoice: Stripe.Invoice) => {
	return stripeInvoice.billing_reason === "subscription_cycle";
};
