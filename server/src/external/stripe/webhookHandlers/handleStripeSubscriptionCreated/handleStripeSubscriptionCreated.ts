import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { setupStripeSubscriptionCreatedContext } from "./setupStripeSubscriptionCreatedContext.js";
import { autoSyncFromSubscriptionWithLock } from "./tasks/autoSyncFromSubscription.js";
import { linkScheduledCustomerProductsToSubscription } from "./tasks/linkScheduledCustomerProductsToSubscription.js";
import { upsertSubscriptionRow } from "./tasks/upsertSubscriptionRow.js";

export const handleStripeSubscriptionCreated = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const subscriptionCreatedContext =
		await setupStripeSubscriptionCreatedContext({ ctx });
	if (!subscriptionCreatedContext) return;

	await upsertSubscriptionRow({
		ctx,
		subscription: subscriptionCreatedContext.subscription,
	});

	await linkScheduledCustomerProductsToSubscription({
		ctx,
		subscription: subscriptionCreatedContext.subscription,
	});

	await autoSyncFromSubscriptionWithLock({ ctx, subscriptionCreatedContext });
};
