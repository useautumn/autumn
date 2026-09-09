import type { Checkout, Invoice, PaymentFailureCode } from "@autumn/shared";
import type Stripe from "stripe";

export interface StripeBillingPlanResult {
	deferred?: boolean;
	deferredMetadataId?: string;
	/** An earlier pending plan's open invoice was returned; this request was not applied. */
	resumedPendingInvoice?: boolean;
	stripeInvoice?: Stripe.Invoice;
	stripeSubscription?: Stripe.Subscription;
	stripeCheckoutSession?:
		| Stripe.Checkout.Session
		| (Pick<Stripe.Checkout.Session, "id"> & { url?: string | null });
	stripeInvoiceItems?: Stripe.InvoiceItem[];
	stripeRefund?: Stripe.Refund;
	requiredAction?: {
		code: PaymentFailureCode;
		reason: string;
	};
	autumnInvoice?: Invoice;
}

export interface AutumnBillingResult {
	checkout?: Checkout;
}

export interface BillingResult {
	stripe: StripeBillingPlanResult;
	autumn?: AutumnBillingResult;
}
