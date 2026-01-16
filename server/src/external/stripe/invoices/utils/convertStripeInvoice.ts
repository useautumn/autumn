import type Stripe from "stripe";

export const stripeInvoiceToStripeSubscriptionId = (
	stripeInvoice: Stripe.Invoice,
) => {
	const subId = stripeInvoice.parent?.subscription_details?.subscription;
	return subId as string | undefined;
};
