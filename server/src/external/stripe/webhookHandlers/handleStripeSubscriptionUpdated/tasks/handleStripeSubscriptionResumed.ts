import { CusProductStatus, cp, nullish } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { addBillingChangeTag } from "../../common/billingChangeTags";
import { trackCustomerProductUpdate } from "../../common/trackCustomerProductUpdate";
import type { StripeSubscriptionUpdatedContext } from "../stripeSubscriptionUpdatedContext";

/**
 * Returns paused customer products to active when Stripe resumes collection.
 *
 * Stripe clears `pause_collection` on its own once a pause reaches its
 * `resumes_at`, so this is the path an auto-resuming `pause_until` takes.
 * `syncCustomerProductStatus` can't own it: paused products aren't in
 * ACTIVE_STATUSES, so they're filtered out of that sync entirely.
 *
 * Scoped to events that actually changed `pause_collection` — a paused plan
 * that has nothing to do with collection (e.g. one parked by a revert trial)
 * is never touched.
 */
export const handleStripeSubscriptionResumed = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { stripeSubscription, previousAttributes, customerProducts } =
		subscriptionUpdatedContext;

	const pauseCollectionChanged =
		previousAttributes.pause_collection !== undefined;
	const resumed =
		pauseCollectionChanged && nullish(stripeSubscription.pause_collection);

	if (!resumed) return;

	// Snapshot: `trackCustomerProductUpdate` writes back into `customerProducts`.
	for (const customerProduct of [...customerProducts]) {
		if (customerProduct.status !== CusProductStatus.Paused) continue;

		const { valid } = cp(customerProduct)
			.recurring()
			.onStripeSubscription({ stripeSubscriptionId: stripeSubscription.id });

		if (!valid) continue;

		const updates = { status: CusProductStatus.Active };

		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates,
		});

		trackCustomerProductUpdate({
			eventContext: subscriptionUpdatedContext,
			customerProduct,
			updates,
		});

		addBillingChangeTag(subscriptionUpdatedContext, "resumed");

		ctx.logger.info(
			`[handleStripeSubscriptionResumed] Resumed ${customerProduct.product.name}`,
		);
	}
};
