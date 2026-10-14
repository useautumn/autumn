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

	await handleSchedulePhaseChanges({
		ctx,
		eventContext: subscriptionUpdatedContext,
	});

	await syncCustomerProductStatus({
		ctx,
		subscriptionUpdatedContext,
	});

	await handleStripeSubscriptionCanceled({
		ctx,
		subscriptionUpdatedContext,
	});

	await handleStripeSubscriptionRenewed({
		ctx,
		subscriptionUpdatedContext,
	});

	await syncAutumnSubscription({
		ctx,
		subscriptionUpdatedContext,
	});

	await handleCancelOnPastDue({
		ctx,
		subscriptionUpdatedContext,
	});

	await handleIgnorePastDue({
		ctx,
		subscriptionUpdatedContext,
	});

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

	logCustomerProductUpdates({
		ctx,
		eventContext: subscriptionUpdatedContext,
	});

	emitBillingChangeWebhook({
		ctx,
		eventContext: subscriptionUpdatedContext,
	});

	ctx.handlerResult = {
		type: event.type,
		context: subscriptionUpdatedContext,
	};
};
