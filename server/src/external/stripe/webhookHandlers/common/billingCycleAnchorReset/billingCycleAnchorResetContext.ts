import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";

export type BillingCycleAnchorResetContext = Pick<
	InvoiceCreatedContext,
	| "stripeSubscription"
	| "stripeSubscriptionId"
	| "fullCustomer"
	| "customerProducts"
	| "billingCycleAnchorResetCustomerProductIds"
	| "nowMs"
>;
