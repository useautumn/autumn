import type { StripeInvoicePaidContext } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/setupStripeInvoicePaidContext";
import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";

export type StripeWebhookHandlerResult =
	| {
			type: "customer.subscription.updated";
			context: StripeSubscriptionUpdatedContext;
	  }
	| {
			type: "invoice.paid";
			context: StripeInvoicePaidContext;
	  };
