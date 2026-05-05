import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { setupStripeSubscriptionCreatedContext } from "./setupStripeSubscriptionCreatedContext.js";
import { autoSyncFromSubscription } from "./tasks/autoSyncFromSubscription.js";

export const handleStripeSubscriptionCreated = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const subscriptionCreatedContext =
		await setupStripeSubscriptionCreatedContext({ ctx });
	if (!subscriptionCreatedContext) return;

	await autoSyncFromSubscription({ ctx, subscriptionCreatedContext });
};
