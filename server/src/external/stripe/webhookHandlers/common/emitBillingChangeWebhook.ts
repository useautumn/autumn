import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";
import type { StripeSubscriptionDeletedContext } from "../handleStripeSubscriptionDeleted/setupStripeSubscriptionDeletedContext";
import type { StripeSubscriptionUpdatedContext } from "../handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";
import { eventContextToAutumnBillingPlan } from "./eventContextToAutumnBillingPlan";

type EventContext =
	| StripeSubscriptionUpdatedContext
	| StripeSubscriptionDeletedContext;

export const emitBillingChangeWebhook = ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: EventContext;
}): void => {
	const autumnBillingPlan = eventContextToAutumnBillingPlan(eventContext);
	const tags = Array.from(eventContext.billingChangeTags);

	void sendBillingUpdatedWebhook({
		ctx,
		autumnBillingPlan,
		originalFullCustomer: eventContext.fullCustomer,
		tags,
	});
};
