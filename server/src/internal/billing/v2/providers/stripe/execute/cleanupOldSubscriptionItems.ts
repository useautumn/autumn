import type { BillingPlan } from "@autumn/shared";
import { CusProductStatus } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { isStripeSubscriptionCanceled } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductToStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs";
import type Stripe from "stripe";

/**
 * Removes expired product items from an old subscription when transitioning to a new subscription.
 *
 * When a product transitions away from an unhealthy (past_due) subscription to a new one,
 * the old product's items remain on the old subscription. This function cleans them up
 * to prevent future charges for the expired product.
 *
 * If removing the items leaves the old subscription with no items, the subscription is canceled.
 */
export const cleanupOldSubscriptionItems = async ({
	ctx,
	billingPlan,
	newStripeSubscription,
}: {
	ctx: AutumnContext;
	billingPlan: BillingPlan;
	newStripeSubscription?: Stripe.Subscription;
}) => {
	const { updateCustomerProduct } = billingPlan.autumn;
	if (!updateCustomerProduct) return;

	// Only clean up when the old product is being expired (immediate transition)
	if (updateCustomerProduct.updates.status !== CusProductStatus.Expired) return;

	// Cleanup only applies when transitioning to a new subscription
	if (!newStripeSubscription) return;

	const oldCustomerProduct = updateCustomerProduct.customerProduct;
	const oldSubscriptionId = oldCustomerProduct.subscription_ids?.[0];

	if (!oldSubscriptionId) return;

	// Same subscription -- items already handled by buildStripeSubscriptionItemsUpdate diff
	if (oldSubscriptionId === newStripeSubscription.id) return;

	const { logger } = ctx;
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const oldSubscription =
		await stripeCli.subscriptions.retrieve(oldSubscriptionId);

	if (isStripeSubscriptionCanceled(oldSubscription)) return;

	// Get the old product's Stripe price IDs
	const { recurringItems } = customerProductToStripeItemSpecs({
		ctx,
		customerProduct: oldCustomerProduct,
	});

	const oldPriceIds = new Set(
		recurringItems.map((item) => item.stripePriceId),
	);

	// Find subscription items belonging to the expired product
	const itemsToRemove = oldSubscription.items.data.filter((item) =>
		oldPriceIds.has(item.price.id),
	);

	if (itemsToRemove.length === 0) return;

	// If ALL items would be removed, cancel the entire subscription
	if (itemsToRemove.length === oldSubscription.items.data.length) {
		logger.debug(
			`[cleanupOldSubscriptionItems] Canceling old subscription ${oldSubscriptionId} (no items remaining)`,
		);
		await stripeCli.subscriptions.cancel(oldSubscriptionId);
		return;
	}

	// Otherwise, remove only the expired product's items
	logger.debug(
		`[cleanupOldSubscriptionItems] Removing ${itemsToRemove.length} items from old subscription ${oldSubscriptionId}`,
	);
	// No proration -- the product is expired and the subscription is already past_due,
	// so we don't want to generate prorated credits for items that weren't being paid for
	await stripeCli.subscriptions.update(oldSubscriptionId, {
		items: itemsToRemove.map((item) => ({ id: item.id, deleted: true })),
		proration_behavior: "none",
	});
};
