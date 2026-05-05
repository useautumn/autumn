import type Stripe from "stripe";
import { getFullStripeSub } from "../../stripeSubUtils.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { setupStripeSubscriptionCreatedContext } from "./setupStripeSubscriptionCreatedContext.js";
import { autoSyncFromSubscription } from "./tasks/autoSyncFromSubscription.js";
import { linkScheduledCustomerProductsToSubscription } from "./tasks/linkScheduledCustomerProductsToSubscription.js";

export const handleStripeSubscriptionCreated = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const { stripeCli, stripeEvent } = ctx;
	const stripeObject = stripeEvent.data.object as Stripe.Subscription;
	const subscription = await getFullStripeSub({
		stripeCli,
		stripeId: stripeObject.id,
	});

	try {
		await linkScheduledCustomerProductsToSubscription({ ctx, subscription });
	} catch (err) {
		ctx.logger.error(
			`[sub.created] failed to link scheduled customer products for subscription ${subscription.id}`,
			err,
		);
	}

	const subscriptionCreatedContext =
		await setupStripeSubscriptionCreatedContext({
			ctx,
			subscription,
		});
	if (!subscriptionCreatedContext) return;

	await autoSyncFromSubscription({ ctx, subscriptionCreatedContext });
};
