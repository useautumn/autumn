/**
 * Detects a Stripe subscription transitioning out of `trialing` and tags the
 * billing change with `trial_ended`.
 *
 * Signal: `event.data.previous_attributes.status === "trialing"` AND the
 * current subscription status is no longer trialing. This is the precise
 * trial-end transition — it does NOT fire on every subscription.updated event.
 */

import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addBillingChangeTag } from "../../../common";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";

export const handleStripeSubscriptionTrialEnded = ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): void => {
	const { previousAttributes, stripeSubscription } = subscriptionUpdatedContext;

	if (previousAttributes.status !== "trialing") return;
	if (stripeSubscription.status === "trialing") return;

	ctx.logger.info(
		`[trialEnded] customer ${subscriptionUpdatedContext.fullCustomer.id ?? subscriptionUpdatedContext.fullCustomer.internal_id} sub ${stripeSubscription.id} status ${previousAttributes.status} → ${stripeSubscription.status}`,
	);

	addBillingChangeTag(subscriptionUpdatedContext, "trial_ended");
};
