import { formatMs } from "@autumn/shared";
import type Stripe from "stripe";
import { handleStripeSubscriptionCanceled } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/handleStripeSubscriptionCanceled/handleStripeSubscriptionCanceled.js";
import { syncAutumnSubscription } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/syncAutumnSubscription.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { logCustomerProductUpdates } from "../common";
import { setupStripeSubscriptionUpdatedContext } from "./setupStripeSubscriptionUpdatedContext.js";
import { handleCancelOnPastDue } from "./tasks/handleCancelOnPastDue.js";
import { handleSchedulePhaseChanges } from "./tasks/handleSchedulePhaseChanges/handleSchedulePhaseChanges.js";
import { handleStripeSubscriptionRenewed } from "./tasks/handleStripeSubscriptionRenewed/handleStripeSubscriptionRenewed.js";
import { syncCustomerProductStatus } from "./tasks/syncCustomerProductStatus/syncCustomerProductStatus.js";

export const handleStripeSubscriptionUpdated = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.CustomerSubscriptionUpdatedEvent;
}) => {
	const subscriptionUpdatedContext =
		await setupStripeSubscriptionUpdatedContext({
			ctx,
			event,
		});

	ctx.logger.debug(
		`Received subscription updated event, now: ${formatMs(subscriptionUpdatedContext?.nowMs)}`,
	);

	if (!subscriptionUpdatedContext) {
		ctx.logger.warn(
			"[sub.updated] subscriptionUpdatedContext not found, skipping",
		);
		return;
	}

	// 1. Handle schedule phase changes
	await handleSchedulePhaseChanges({
		ctx,
		eventContext: subscriptionUpdatedContext,
	});

	// 2. Sync status from Stripe to customer products (sends webhook event too)
	await syncCustomerProductStatus({
		ctx,
		subscriptionUpdatedContext,
	});

	// 3. Handle state transitions (canceled, past_due, renewed)
	await handleStripeSubscriptionCanceled({
		ctx,
		subscriptionUpdatedContext,
	});

	await handleStripeSubscriptionRenewed({
		ctx,
		subscriptionUpdatedContext,
	});

	// 4. Sync to Autumn subscription table
	await syncAutumnSubscription({
		ctx,
		subscriptionUpdatedContext,
	});

	// 5. Handle cancel_on_past_due org setting
	await handleCancelOnPastDue({
		ctx,
		subscriptionUpdatedContext,
	});

	// 6. Log all customer product updates
	logCustomerProductUpdates({
		ctx,
		eventContext: subscriptionUpdatedContext,
	});
};
