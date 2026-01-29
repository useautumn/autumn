import type { Checkout, PaymentFailureCode } from "@autumn/shared";
import type Stripe from "stripe";

export interface StripeBillingPlanResult {
	deferred?: boolean;
	stripeInvoice?: Stripe.Invoice;
	stripeSubscription?: Stripe.Subscription;
	stripeCheckoutSession?: Stripe.Checkout.Session;
	requiredAction?: {
		code: PaymentFailureCode;
		reason: string;
	};
}

export interface AutumnBillingResult {
	checkout?: Checkout;
}

export interface BillingResult {
	stripe: StripeBillingPlanResult;
	autumn?: AutumnBillingResult;
}
