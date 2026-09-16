import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";

export type StripeWebhookHandlerResult = {
	type: "customer.subscription.updated";
	context: StripeSubscriptionUpdatedContext;
};
