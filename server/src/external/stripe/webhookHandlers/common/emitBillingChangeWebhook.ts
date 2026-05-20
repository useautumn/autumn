/**
 * Central emission point for `billing.updated` from Stripe webhook
 * handlers. Builds the AutumnBillingPlan from the eventContext's tracked
 * mutations, gathers tags, and fires the webhook fire-and-forget.
 *
 * Called as the last step of `handleStripeSubscriptionUpdated` and
 * `handleStripeSubscriptionDeleted`, after all tasks have run.
 */

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
