import type Stripe from "stripe";

export interface StripeBillingPlanResult {
	deferred?: boolean;
	stripeInvoice?: Stripe.Invoice;
	stripeSubscription?: Stripe.Subscription;
}
