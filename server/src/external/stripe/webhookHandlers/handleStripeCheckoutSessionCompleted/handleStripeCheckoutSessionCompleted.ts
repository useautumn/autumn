import type Stripe from "stripe";
import { handleCheckoutSessionMetadataV2 } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/handleCheckoutSessionMetadataV2.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { setupCheckoutSessionCompletedContext } from "./setupCheckoutSessionCompletedContext.js";
import { handleLegacyCheckoutSessionMetadata } from "./tasks/handleLegacyCheckoutSessionMetadata.ts/handleCheckoutSessionCompletedLegacy.js";
import { handleSetupPaymentMetadata } from "./tasks/handleSetupPaymentMetadata.js";
import { handleStandaloneSetupCheckout } from "./tasks/handleStandaloneSetupCheckout.js";
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
	await handleCheckoutSessionMetadataV2({
		ctx,
		checkoutContext,
	});

	// Setup payment with metadata (plan attachment after setup)
	await handleSetupPaymentMetadata({
		ctx,
		checkoutContext,
	});

	// Legacy flow
	await handleLegacyCheckoutSessionMetadata({
		ctx,
		checkoutContext,
	});

	// Handle standalone setup checkout (setup mode without Autumn metadata)
	await handleStandaloneSetupCheckout({
		ctx,
		checkoutContext,
	});

	// Update customer name/email from checkout details
	await updateCustomerFromCheckout({
		ctx,
		checkoutSessionContext: checkoutContext,
	});
};
