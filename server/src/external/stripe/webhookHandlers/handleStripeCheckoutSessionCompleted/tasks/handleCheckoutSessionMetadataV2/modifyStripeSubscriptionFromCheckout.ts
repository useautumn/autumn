import type { DeferredAutumnBillingPlanData } from "@autumn/shared";
import { BillingType, type Price, type UsagePriceConfig } from "@autumn/shared";
import type Stripe from "stripe";
import { getEmptyPriceItem } from "@/external/stripe/priceToStripeItem/priceToStripeItem";
import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";

/**
 * Modifies the Stripe subscription after checkout creates it:
 * 1. Swaps metered (arrear) prices to empty prices for entity-attached products
 * 2. Migrates subscription to flexible billing mode
 *
 * Note: Autumn subscription upsert is now handled by executeAutumnBillingPlan via upsertSubscription field
 */
export const modifyStripeSubscriptionFromCheckout = async ({
	ctx,
	checkoutContext,
	deferredData,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
	deferredData: DeferredAutumnBillingPlanData;
}) => {
	const { stripeCli, org } = ctx;
	const { stripeSubscription } = checkoutContext;
	const { billingContext } = deferredData;

	if (!stripeSubscription) return;

	const prices = billingContext.fullProducts.flatMap((p) => p.prices);
	const isEntityAttached = !!billingContext.fullCustomer.entity;

	// Build subscription items update
	const itemsUpdate: Stripe.SubscriptionUpdateParams.Item[] = [];

	for (const item of stripeSubscription.items.data) {
		const stripePriceId = item.price.id;

		// Find arrear price matching this subscription item
		const arrearPrice = findArrearPriceFromStripeId({ prices, stripePriceId });

		// For entity-attached products, swap metered prices to empty prices
		// This allows Autumn to track usage per-entity instead of via Stripe meters
		if (arrearPrice && isEntityAttached) {
			// Delete the metered price item
			itemsUpdate.push({
				id: item.id,
				deleted: true,
			});

			// Add empty price (either pre-created or dynamically generated)
			const emptyPriceId = (arrearPrice.config as UsagePriceConfig)
				.stripe_empty_price_id;

			if (emptyPriceId) {
				itemsUpdate.push({
					price: emptyPriceId,
					quantity: 0,
				});
			} else {
				itemsUpdate.push(getEmptyPriceItem({ price: arrearPrice, org }) as any);
			}
		}

		// TODO: Handle allocated prices here when implemented
	}

	// Apply subscription items update if needed
	if (itemsUpdate.length > 0) {
		await stripeCli.subscriptions.update(stripeSubscription.id, {
			items: itemsUpdate,
		});
		ctx.logger.info(
			`[checkout.completed] Swapped ${itemsUpdate.length / 2} metered prices to empty prices`,
		);
	}

	// Migrate to flexible billing mode if not already
	if (stripeSubscription.billing_mode?.type !== "flexible") {
		await stripeCli.subscriptions.migrate(stripeSubscription.id, {
			billing_mode: { type: "flexible" },
		});
		ctx.logger.info(
			"[checkout.completed] Migrated subscription to flexible billing",
		);
	}
};

/**
 * Finds an arrear (metered) price matching the given Stripe price ID.
 */
const findArrearPriceFromStripeId = ({
	prices,
	stripePriceId,
}: {
	prices: Price[];
	stripePriceId: string;
}): Price | undefined => {
	return prices.find((price) => {
		const config = price.config as UsagePriceConfig;
		return (
			config.stripe_price_id === stripePriceId &&
			price.billing_type === BillingType.UsageInArrear
		);
	});
};
