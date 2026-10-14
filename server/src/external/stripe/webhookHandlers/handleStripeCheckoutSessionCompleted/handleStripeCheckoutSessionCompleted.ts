import type Stripe from "stripe";
import { handleCheckoutSessionEnabledImmediately } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionEnabledImmediately/handleCheckoutSessionEnabledImmediately.js";
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

	await handleCheckoutSessionMetadataV2({
		ctx,
		checkoutContext,
	});

	await handleCheckoutSessionEnabledImmediately({
		ctx,
		checkoutContext,
	});

	await handleSetupPaymentMetadata({
		ctx,
		checkoutContext,
	});

	await handleLegacyCheckoutSessionMetadata({
		ctx,
		checkoutContext,
	});

	await handleStandaloneSetupCheckout({
		ctx,
		checkoutContext,
	});

	await updateCustomerFromCheckout({
		ctx,
		checkoutSessionContext: checkoutContext,
	});
};
