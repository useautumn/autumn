import type { BillingContext, BillingResult } from "@autumn/shared";
import {
	type BillingResponse,
	checkoutToUrl,
	stripeToAtmnAmount,
} from "@autumn/shared";

export const billingResultToResponse = ({
	billingContext,
	billingResult,
}: {
	billingContext: BillingContext;
	billingResult: BillingResult;
}): BillingResponse => {
	const { fullCustomer } = billingContext;

	const customerId = fullCustomer.id ?? fullCustomer.internal_id;

	const stripeInvoice = billingResult.stripe.stripeInvoice;
	const stripeCheckoutSession = billingResult.stripe.stripeCheckoutSession;
	const autumnCheckout = billingResult.autumn?.checkout;

	// Autumn checkout URL takes priority, then Stripe checkout session, then invoice hosted URL
	const paymentUrl = autumnCheckout
		? checkoutToUrl({ checkoutId: autumnCheckout.id })
		: stripeCheckoutSession?.url
			? stripeCheckoutSession.url
			: stripeInvoice?.status === "open" && stripeInvoice.hosted_invoice_url
				? stripeInvoice.hosted_invoice_url
				: null;

	return {
		customer_id: customerId,
		entity_id: fullCustomer.entity?.id,
		invoice: stripeInvoice
			? {
					status: stripeInvoice.status,
					stripe_id: stripeInvoice.id,
					total: stripeToAtmnAmount({
						amount: stripeInvoice.total,
						currency: stripeInvoice.currency,
					}),
					currency: stripeInvoice.currency,
					hosted_invoice_url: stripeInvoice.hosted_invoice_url ?? null,
				}
			: undefined,
		payment_url: paymentUrl,
		checkout_url: stripeCheckoutSession?.url ?? null,
		required_action: billingResult.stripe.requiredAction,
	} satisfies BillingResponse;
};
