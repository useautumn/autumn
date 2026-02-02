import type Stripe from "stripe";
import { handleCheckoutSessionMetadataV2 } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/handleCheckoutSessionMetadataV2.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { setupCheckoutSessionCompletedContext } from "./setupCheckoutSessionCompletedContext.js";
import { handleLegacyCheckoutSessionMetadata } from "./tasks/handleLegacyCheckoutSessionMetadata.ts/handleCheckoutSessionCompletedLegacy.js";
import { queueCheckoutRewardTasks } from "./tasks/queueCheckoutRewardTasks.js";
import { updateCustomerFromCheckout } from "./tasks/updateCustomerFromCheckout.js";

export const handleStripeCheckoutSessionCompleted = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.CheckoutSessionCompletedEvent;
}) => {
	const checkoutContext = await setupCheckoutSessionCompletedContext({
		ctx,
		event,
	});

	// V2 flow
	const v2Result = await handleCheckoutSessionMetadataV2({
		ctx,
		checkoutContext,
	});

	// Legacy flow
	const legacyResult = await handleLegacyCheckoutSessionMetadata({
		ctx,
		checkoutContext,
	});

	// Use whichever result is available (only one will be non-null based on metadata type)
	const result = v2Result ?? legacyResult;
	if (!result) return;

	const { stripeCheckoutSession, stripeSubscription } = checkoutContext;

	// Queue checkout reward tasks
	await queueCheckoutRewardTasks({
		ctx,
		rewardData: {
			customer: result.customer,
			products: result.products,
			stripeSubscriptionId: stripeSubscription?.id,
		},
	});

	// Update customer name/email from checkout details
	await updateCustomerFromCheckout({
		ctx,
		customer: result.customer,
		stripeCheckoutSession,
	});
};
