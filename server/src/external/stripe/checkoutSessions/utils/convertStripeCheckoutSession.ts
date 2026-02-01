import type Stripe from "stripe";

export const stripeCheckoutSessionToSubscriptionId = async ({
	stripeCheckoutSession,
}: {
	stripeCheckoutSession: Stripe.Checkout.Session;
}) => {
	return typeof stripeCheckoutSession.subscription === "string"
		? stripeCheckoutSession.subscription
		: (stripeCheckoutSession.subscription?.id ?? null);
};

export const stripeCheckoutSessionToInvoiceId = async ({
	stripeCheckoutSession,
}: {
	stripeCheckoutSession: Stripe.Checkout.Session;
}) => {
	return typeof stripeCheckoutSession.invoice === "string"
		? stripeCheckoutSession.invoice
		: (stripeCheckoutSession.invoice?.id ?? null);
};
