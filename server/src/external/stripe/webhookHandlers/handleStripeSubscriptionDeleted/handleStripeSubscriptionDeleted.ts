import type Stripe from "stripe";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";
import { logCustomerProductUpdates } from "../common";
import { setupStripeSubscriptionDeletedContext } from "./setupStripeSubscriptionDeletedContext";
import { expireAndActivateCustomerProducts } from "./tasks/expireAndActivateCustomerProducts";
import { processConsumablePricesForSubscriptionDeleted } from "./tasks/processConsumablePricesForSubscriptionDeleted";

/**
 * Handles Stripe subscription.deleted webhook.
 *
 * NOTE: Previously there was a race condition concern where subscription.updated
 * might expire products before subscription.deleted arrives. For now we assume
 * this is not an issue, but monitor if problems arise.
 */
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

	// Task 1: Create invoices for arrear prices (usage-based)
	await processConsumablePricesForSubscriptionDeleted({ ctx, eventContext });

	// Task 2: Expire customer products + delete scheduled + activate defaults
	await expireAndActivateCustomerProducts({ ctx, eventContext });

	// Task 3: Log all customer product updates and deletions
	logCustomerProductUpdates({
		ctx,
		eventContext,
		logPrefix: "[sub.deleted]",
	});
};
