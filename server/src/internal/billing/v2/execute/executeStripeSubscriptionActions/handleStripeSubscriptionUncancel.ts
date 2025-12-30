import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { BillingPlan } from "@/internal/billing/v2/billingPlan";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/**
 * Uncancels a Stripe subscription and updates internal customer product state.
 *
 * Sets cancel_at_period_end to false in Stripe and clears canceled flags in DB.
 * Ensures consistency between Stripe and Autumn state.
 * No-ops if uncancel is not needed based on billing plan.
 */
export const handleStripeSubscriptionUncancel = async ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}): Promise<void> => {
	const stripeSubscription = billingContext.stripeSubscription;

	const customerProduct = billingPlan.autumn.updateCustomerProduct;

	const shouldUncancelSubscription =
		billingPlan.autumn.shouldUncancelSubscription &&
		stripeSubscription &&
		customerProduct;

	if (!shouldUncancelSubscription) {
		return;
	}

	const { db, logger, org, env } = ctx;

	logger.info("Uncanceling subscription in Stripe", {
		stripeSubscriptionId: stripeSubscription.id,
		customerProductId: customerProduct.id,
	});

	const stripeClient = createStripeCli({ org, env });

	// Update Stripe first - if this fails, we don't modify our DB
	await stripeClient.subscriptions.update(stripeSubscription.id, {
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
