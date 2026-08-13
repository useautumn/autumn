import type Stripe from "stripe";

export const isFirstSubscriptionInvoice = (invoice: Stripe.Invoice): boolean =>
	invoice.billing_reason === "subscription_create";

export const isStripeInvoiceForNewPeriod = (stripeInvoice: Stripe.Invoice) => {
	return stripeInvoice.billing_reason === "subscription_cycle";
};

/** An invoice Autumn raised for a billing update, outside invoice mode. */
export const isManualBillingUpdateInvoice = (
	invoice: Stripe.Invoice,
): boolean =>
	Boolean(invoice.metadata?.autumn_billing_update) &&
	invoice.metadata?.autumn_invoice_mode !== "true";
