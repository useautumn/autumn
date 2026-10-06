import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";

/** What a landed anchor move reads, whether an invoice or a subscription update carried it. */
export type BillingCycleAnchorResetContext = Pick<
	InvoiceCreatedContext,
	| "stripeSubscription"
	| "stripeSubscriptionId"
	| "fullCustomer"
	| "customerProducts"
	| "billingCycleAnchorResetCustomerProductIds"
	| "nowMs"
>;
