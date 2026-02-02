import type Stripe from "stripe";
import { handleCheckoutSessionMetadataV2 } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/handleCheckoutSessionMetadataV2.js";
import { handleStandaloneSetupCheckout } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleLegacyCheckoutSessionMetadata.ts/handleStandaloneSetupCheckout.js";
import { getMetadataFromCheckoutSession } from "@/internal/metadata/metadataUtils.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { setupCheckoutSessionCompletedContext } from "./setupCheckoutSessionCompletedContext.js";
import { handleLegacyCheckoutSessionMetadata } from "./tasks/handleLegacyCheckoutSessionMetadata.ts/handleCheckoutSessionCompletedLegacy.js";

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

	const { logger } = ctx;
	const metadata = await getMetadataFromCheckoutSession(
		checkoutContext.stripeCheckoutSession,
		ctx.db,
	);

	if (!metadata) {
		if (checkoutContext.stripeCheckoutSession.mode === "setup") {
			logger.info(
				"checkout.completed: setup mode without metadata, handling standalone setup",
			);
			await handleStandaloneSetupCheckout({
				ctx,
				checkoutSession: checkoutContext.stripeCheckoutSession,
			});
			return;
		}
		logger.info("checkout.completed: metadata not found, skipping");
		return;
	}

	// V2 flow
	await handleCheckoutSessionMetadataV2({
		ctx,
		checkoutContext,
	});

	// Legacy flow
	await handleLegacyCheckoutSessionMetadata({
		ctx,
		checkoutContext,
	});
};
