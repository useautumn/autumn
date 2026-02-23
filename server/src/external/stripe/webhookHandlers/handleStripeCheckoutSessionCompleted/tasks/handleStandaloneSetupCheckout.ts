import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { updateDefaultPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext.js";
import type { CheckoutSessionCompletedContext } from "../setupCheckoutSessionCompletedContext.js";

/**
 * Handles standalone setup checkout (setup mode without Autumn metadata).
 * Updates customer's default payment method.
 */
export const handleStandaloneSetupCheckout = async ({
	ctx,
	checkoutContext,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
}) => {
	const { org, env, logger } = ctx;
	const { stripeCheckoutSession, metadata } = checkoutContext;

	// Only handle setup mode without Autumn metadata
	if (stripeCheckoutSession.mode !== "setup" || metadata) {
		return;
	}

	const stripeCustomerId = stripeCheckoutSession.customer as string;
	if (!stripeCustomerId) {
		logger.info("Standalone setup checkout: no customer ID, skipping");
		return;
	}

	const customer = await CusService.getByStripeId({
		ctx,
		stripeId: stripeCustomerId,
	});

	if (!customer) {
		logger.info(
			"Standalone setup checkout: customer not found in Autumn, skipping",
		);
		return;
	}

	const stripeCli = createStripeCli({ org, env });
	const paymentMethod = await updateDefaultPaymentMethod({
		stripeCli,
		stripeCustomerId,
	});

	if (!paymentMethod) {
		logger.warn(
			"Standalone setup checkout: no payment method found after setup",
		);
		return;
	}

	logger.info(
		`Standalone setup checkout: updated default payment method for customer ${customer.id}`,
	);
};
