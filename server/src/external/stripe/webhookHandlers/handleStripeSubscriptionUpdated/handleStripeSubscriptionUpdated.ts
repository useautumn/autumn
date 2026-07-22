import type Stripe from "stripe";
import { handleStripeSubscriptionCanceled } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/handleStripeSubscriptionCanceled/handleStripeSubscriptionCanceled.js";
import { syncAutumnSubscription } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/syncAutumnSubscription.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { emitBillingChangeWebhook, logCustomerProductUpdates } from "../common";
import { setupStripeSubscriptionUpdatedContext } from "./setupStripeSubscriptionUpdatedContext.js";
import { applyPooledBalanceTransitions } from "./tasks/applyPooledBalanceTransitions";
import { autoSyncUpdatedSubscription } from "./tasks/autoSyncUpdatedSubscription.js";
import { handleCancelOnPastDue } from "./tasks/handleCancelOnPastDue.js";
import { handleIgnorePastDue } from "./tasks/handleIgnorePastDue.js";
import { handleSchedulePhaseChanges } from "./tasks/handleSchedulePhaseChanges/handleSchedulePhaseChanges.js";
import { handleStripeSubscriptionRenewed } from "./tasks/handleStripeSubscriptionRenewed/handleStripeSubscriptionRenewed.js";
import { handleStripeSubscriptionTrialEnded } from "./tasks/handleStripeSubscriptionTrialEnded/handleStripeSubscriptionTrialEnded.js";
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

	// 5b. Keep ignore_past_due plans alive instead of letting Stripe cancel them
	await handleIgnorePastDue({
		ctx,
		subscriptionUpdatedContext,
	});

	// 6. Detect trial-end transition (tags only — no DB writes)
	handleStripeSubscriptionTrialEnded({
		ctx,
		subscriptionUpdatedContext,
	});

	await autoSyncUpdatedSubscription({
		ctx,
		subscriptionUpdatedContext,
	});
	await applyPooledBalanceTransitions({
		ctx,
		eventContext: subscriptionUpdatedContext,
	});

	// 7. Log all customer product updates
	logCustomerProductUpdates({
		ctx,
		eventContext: subscriptionUpdatedContext,
	});

	// 8. Emit billing.updated webhook (fire-and-forget) if anything changed
	emitBillingChangeWebhook({
		ctx,
		eventContext: subscriptionUpdatedContext,
	});
};
