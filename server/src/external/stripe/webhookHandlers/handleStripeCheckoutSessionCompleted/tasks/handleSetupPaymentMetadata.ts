import { type DeferredSetupPaymentData, MetadataType } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { updateDefaultPaymentMethod } from "@/external/stripe/stripeCusUtils";
import { billingActions } from "@/internal/billing/v2/actions";
import { setupPaymentToAttachParams } from "@/internal/billing/v2/actions/setupPayment/setupPaymentUtils";
import { MetadataService } from "@/internal/metadata/MetadataService";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext";
import type { CheckoutSessionCompletedContext } from "../setupCheckoutSessionCompletedContext";

/**
 * Handles setup checkout sessions with metadata (plan attachment after setup).
 * Updates the customer's payment method, then attaches the plan if specified.
 */
export const handleSetupPaymentMetadata = async ({
	ctx,
	checkoutContext,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
}): Promise<void> => {
	const { org, env, logger } = ctx;
	const { stripeCheckoutSession, metadata } = checkoutContext;

	if (metadata?.type !== MetadataType.SetupPaymentV2) {
		return;
	}

	logger.info(
		`[checkout.completed] Handling setup payment metadata: ${metadata.id}`,
	);

	const deferredData = metadata.data as DeferredSetupPaymentData;
	const stripeCustomerId = stripeCheckoutSession.customer as string;

	if (!stripeCustomerId) {
		logger.warn("Setup payment metadata: no Stripe customer ID, skipping");
		await MetadataService.delete({ db: ctx.db, id: metadata.id });
		return;
	}

	// 1. Update customer's default payment method
	const stripeCli = createStripeCli({ org, env });
	const paymentMethod = await updateDefaultPaymentMethod({
		stripeCli,
		stripeCustomerId,
	});

	if (paymentMethod) {
		logger.info(
			`Setup payment metadata: set default payment method for ${stripeCustomerId}`,
		);
	} else {
		logger.warn("Setup payment metadata: no payment method found after setup");
	}

	// 2. Attach plan if plan_id was specified
	if (deferredData.params.plan_id) {
		logger.info(
			`Setup payment metadata: attaching plan ${deferredData.params.plan_id}`,
		);

		const attachParams = setupPaymentToAttachParams({
			params: deferredData.params,
		});

		await billingActions.attach({
			ctx,
			params: attachParams,
			preview: false,
			skipAutumnCheckout: true,
		});

		logger.info(
			`Setup payment metadata: plan ${deferredData.params.plan_id} attached successfully`,
		);
	}

	// 3. Cleanup metadata
	await MetadataService.delete({ db: ctx.db, id: metadata.id });
};
