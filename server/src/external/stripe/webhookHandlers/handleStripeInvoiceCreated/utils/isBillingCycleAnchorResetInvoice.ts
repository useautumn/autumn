import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";

/** Stripe raises the scheduled anchor move as a subscription_update invoice; it closes the re-anchored products' shortened period. */
export const isBillingCycleAnchorResetInvoice = ({
	eventContext,
}: {
	eventContext: InvoiceCreatedContext;
}): boolean =>
	eventContext.stripeInvoice.billing_reason === "subscription_update" &&
	eventContext.billingCycleAnchorResetCustomerProductIds.length > 0;
