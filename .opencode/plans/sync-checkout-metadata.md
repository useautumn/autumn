# Plan: Sync Subscription Item Metadata After Stripe Checkout

## Problem
Stripe Checkout `SessionCreateParams.LineItem` does NOT support a `metadata` field. When subscriptions are created via checkout (customer has no payment method), the resulting subscription items lack `autumn_price_id` and `autumn_customer_price_id` metadata. This breaks the `StoreInvoiceLineItems` workflow's ability to match Stripe line items to Autumn billing line items via subscription item metadata (match priority #2).

## Approach
After checkout completes, match each Autumn customer price → checkout line item → subscription item by Stripe price ID, then patch the metadata onto each subscription item.

## Files to Create

### 1. `server/src/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/syncSubscriptionItemMetadataFromCheckout.ts`

```typescript
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
	const subscriptionItems =
		checkoutContext.stripeSubscription?.items.data;

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
		ctx.logger.info(
			"[checkout.completed] Synced subscription item metadata",
			{ data2: [`${updates.length} items updated`] },
		);
	}
};
```

## Files to Modify

### 2. `server/src/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/handleCheckoutSessionMetadataV2.ts`

Add import and call the sync function **after** `modifyStripeSubscriptionFromCheckout` (step 2) and **before** `executeAutumnBillingPlan`.

**Add import:**
```typescript
import { syncSubscriptionItemMetadataFromCheckout } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/syncSubscriptionItemMetadataFromCheckout";
```

**Add call after line 44 (after modifyStripeSubscriptionFromCheckout):**
```typescript
	// 3. Sync Autumn metadata onto subscription items created by checkout
	await syncSubscriptionItemMetadataFromCheckout({
		ctx,
		checkoutContext,
		deferredData: updatedDeferredData,
	});
```

## Matching Logic Explained

1. For each `FullCustomerPrice` in `insertCustomerProducts`:
   - Use `findCheckoutLineItemByAutumnPrice()` to find the matching checkout `LineItem` by Stripe price/product ID
   - The checkout `LineItem.price.id` matches the `Subscription.Item.price.id` (Stripe uses the same price for both)
   - Update the subscription item's metadata with `autumn_price_id` (from `price.id`) and `autumn_customer_price_id` (from `cusPrice.id`)
   - **Merge** existing metadata via spread (`...subItem.metadata`) to not override other keys

## Validation
- Existing 3 tests in `stripe-checkout-line-items.test.ts` should continue to pass
- Line items stored by the `StoreInvoiceLineItems` workflow should now match via subscription item metadata (priority #2) instead of falling back to product ID matching (priority #4)

## Lint
Run `bunx biome check --write` on the new file and modified file after implementation.
