import type Stripe from "stripe";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";
import { emitBillingChangeWebhook, logCustomerProductUpdates } from "../common";
import { setupStripeSubscriptionDeletedContext } from "./setupStripeSubscriptionDeletedContext";
import { expireAndActivateCustomerProducts } from "./tasks/expireAndActivateCustomerProducts";
import { processConsumablePricesForSubscriptionDeleted } from "./tasks/processConsumablePricesForSubscriptionDeleted";
import { voidInvoicesForSubscriptionDeleted } from "./tasks/voidInvoicesForSubscriptionDeleted";

export const handleStripeSubscriptionDeleted = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.CustomerSubscriptionDeletedEvent;
}) => {
	const { logger } = ctx;

	const eventContext = await setupStripeSubscriptionDeletedContext({
		ctx,
		event,
	});

	if (!eventContext) {
		logger.debug("[sub.deleted] Skipping - context not found or locked");
		return;
	}

	logger.info(`[sub.deleted] Processing subscription.deleted`);

	await processConsumablePricesForSubscriptionDeleted({ ctx, eventContext });

	await expireAndActivateCustomerProducts({ ctx, eventContext });

	await voidInvoicesForSubscriptionDeleted({ ctx, eventContext });

	logCustomerProductUpdates({
		ctx,
		eventContext,
	});

	emitBillingChangeWebhook({
		ctx,
		eventContext,
	});
};
