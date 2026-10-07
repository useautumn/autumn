import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";

/** Stripe raises a scheduled anchor move as a subscription_update invoice. */
export const isBillingCycleAnchorResetInvoice = ({
	eventContext,
}: {
	eventContext: InvoiceCreatedContext;
}): boolean =>
	eventContext.stripeInvoice.billing_reason === "subscription_update" &&
	eventContext.billingCycleAnchorResetCustomerProductIds.length > 0;
