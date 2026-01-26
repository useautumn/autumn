import type Stripe from "stripe";

export const isStripeInvoiceForNewPeriod = (stripeInvoice: Stripe.Invoice) => {
	return stripeInvoice.billing_reason === "subscription_cycle";
};
