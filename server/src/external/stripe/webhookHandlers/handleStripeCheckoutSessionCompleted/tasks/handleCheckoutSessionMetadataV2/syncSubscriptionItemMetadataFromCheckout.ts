import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";

/**
 * After Stripe Checkout creates subscription items, sync `autumn_price_id` and
 * `autumn_customer_price_id` metadata onto each subscription item.
 *
 * Checkout line items don't support per-item metadata, so the subscription items
 * created from checkout lack the Autumn correlation keys. This function matches
 * each Autumn customer price → checkout line item → subscription item by price ID,
 * then patches the metadata (preserving existing keys).
 */
export const syncSubscriptionItemMetadataFromCheckout = async ({
	ctx,
	checkoutContext,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
}) => {
	const { stripeCli } = ctx;
	const checkoutLineItems =
		checkoutContext.stripeCheckoutSession.line_items?.data;
	const subscriptionItems = checkoutContext.stripeSubscription?.items.data;

	if (!checkoutLineItems?.length || !subscriptionItems?.length) return;

	const updates: Promise<unknown>[] = [];

	for (const checkoutLineItem of checkoutLineItems) {
		const subscriptionItem = subscriptionItems.find(
			(si) => si.price?.id === checkoutLineItem.price?.id,
		);

		if (!subscriptionItem) continue;

		const checkoutLineItemMetadata = checkoutLineItem.metadata;

		if (!checkoutLineItemMetadata) continue;

		const updatedMetadata = {
			...subscriptionItem.metadata,
			...checkoutLineItemMetadata,
		};

		const updateSubscriptionItemMetadata = async () => {
			try {
				await stripeCli.subscriptionItems.update(subscriptionItem.id, {
					metadata: updatedMetadata,
				});
			} catch (error) {
				ctx.logger.error(
					`[syncSubscriptionItemMetadataFromCheckout] Error updating subscription item metadata: ${error}`,
					{
						data: {
							subscriptionItemId: subscriptionItem.id,
							updatedMetadata,
						},
					},
				);
			}
		};

		updates.push(updateSubscriptionItemMetadata());
	}

	if (updates.length > 0) {
		await Promise.all(updates);
		ctx.logger.info("[checkout.completed] Synced subscription item metadata");
	}
};
