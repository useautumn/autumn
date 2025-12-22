import type { FullCusProduct } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/**
 * Uncancels a Stripe subscription and updates internal customer product state.
 *
 * Sets cancel_at_period_end to false in Stripe and clears canceled flags in DB.
 * Ensures consistency between Stripe and Autumn state.
 *
 * @throws If Stripe update fails, preventing inconsistent state
 */
export const executeStripeSubscriptionUncancel = async ({
	ctx,
	stripeSubscriptionId,
	customerProduct,
}: {
	ctx: AutumnContext;
	stripeSubscriptionId: string;
	customerProduct: FullCusProduct;
}): Promise<void> => {
	const { db, logger, org, env } = ctx;

	logger.info("Uncanceling subscription in Stripe", {
		stripeSubscriptionId,
		customerProductId: customerProduct.id,
	});

	const stripeClient = createStripeCli({ org, env });

	// Update Stripe first - if this fails, we don't modify our DB
	await stripeClient.subscriptions.update(stripeSubscriptionId, {
		cancel_at_period_end: false,
	});

	logger.info("Uncanceling customer product in Autumn");
	await CusProductService.update({
		db,
		cusProductId: customerProduct.id,
		updates: {
			canceled: false,
			canceled_at: null,
			ended_at: null,
		},
	});

	logger.info("Successfully uncanceled subscription");
};
