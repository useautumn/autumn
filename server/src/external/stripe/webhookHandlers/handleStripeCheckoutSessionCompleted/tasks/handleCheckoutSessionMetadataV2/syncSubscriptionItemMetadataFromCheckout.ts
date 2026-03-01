import type { DeferredAutumnBillingPlanData } from "@autumn/shared";
import { findCheckoutLineItemByAutumnPrice } from "@/external/stripe/checkoutSessions/utils/findCheckoutLineItem";
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
	deferredData,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
	deferredData: DeferredAutumnBillingPlanData;
}) => {
	const { stripeCli } = ctx;
	const checkoutLineItems =
		checkoutContext.stripeCheckoutSession.line_items?.data;
	const subscriptionItems = checkoutContext.stripeSubscription?.items.data;

	if (!checkoutLineItems?.length || !subscriptionItems?.length) return;

	const { insertCustomerProducts } = deferredData.billingPlan.autumn;

	const updates: Promise<unknown>[] = [];

	for (const cusProduct of insertCustomerProducts) {
		const product = cusProduct.product;

		for (const cusPrice of cusProduct.customer_prices) {
			const price = cusPrice.price;

			// 1. Match Autumn price → checkout line item
			const checkoutLineItem = findCheckoutLineItemByAutumnPrice({
				lineItems: checkoutLineItems,
				price,
				product,
				errorOnNotFound: false,
			});

			if (!checkoutLineItem?.price?.id) continue;

			// 2. Match checkout line item → subscription item by Stripe price ID
			const subItem = subscriptionItems.find(
				(si) => si.price.id === checkoutLineItem.price!.id,
			);

			if (!subItem) continue;

			// 3. Update subscription item metadata (merge, don't override)
			updates.push(
				stripeCli.subscriptionItems.update(subItem.id, {
					metadata: {
						...subItem.metadata,
						autumn_price_id: price.id,
						autumn_customer_price_id: cusPrice.id,
					},
				}),
			);
		}
	}

	if (updates.length > 0) {
		await Promise.all(updates);
		ctx.logger.info("[checkout.completed] Synced subscription item metadata", {
			data2: [`${updates.length} items updated`],
		});
	}
};
