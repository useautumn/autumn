import type Stripe from "stripe";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { handleCheckoutSessionCompletedLegacy } from "./legacy/handleCheckoutSessionCompletedLegacy.js";
import { setupCheckoutSessionCompletedContext } from "./setupCheckoutSessionCompletedContext.js";

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
	if (checkoutContext) {
		ctx.logger.info(
			"[checkout.session.completed] V2 checkout - not yet implemented",
		);
		return;
	}

	// Legacy flow - pass original params unchanged
	const { db, org, env } = ctx;
	await handleCheckoutSessionCompletedLegacy({
		ctx,
		db,
		org,
		data: event.data.object,
		env,
	});
};
