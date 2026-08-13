import { type FullCusProduct, hasCustomerProductEnded } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";

/**
 * Expires customer products that have ended (based on ended_at time).
 * Also activates default product if no other active product exists in the same group.
 * Caches expired products so invoice.created can access them for usage-based billing.
 */
export const expireEndedCustomerProducts = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { logger } = ctx;
	const { customerProducts, stripeSubscription, nowMs, fullCustomer } =
		eventContext;

	const expiredCustomerProducts: FullCusProduct[] = [];

	// Snapshot: expiring can insert a default product onto `customerProducts`,
	// which the for-of would otherwise pick up as an extra pass.
	for (const customerProduct of [...customerProducts]) {
		const shouldExpire = hasCustomerProductEnded(customerProduct, { nowMs });

		if (!shouldExpire) continue;

		logger.info(
			`Expiring product: ${customerProduct.product.name}${customerProduct.entity_id ? `@${customerProduct.entity_id}` : ""}`,
		);

		// Auto-preserve remaining one-off prepaid balances as lifetime cusEnts
		// before the product is expired. Billing-action flows already do this
		// at compute time; this is the webhook-driven equivalent for scheduled
		// phase transitions. The eventContext entry is consumed by
		// logCustomerProductUpdates so the structured summary lands in one place.
		const carryOver = await customerProductActions.preserveOneOffPrepaid({
			ctx,
			customerProduct,
			fullCustomer,
		});
		if (carryOver.preservedCount > 0) {
			eventContext.oneOffPrepaidCarryOvers.push({
				customerProductId: customerProduct.id,
				productName: customerProduct.product.name,
				preservedCount: carryOver.preservedCount,
				preservedFeatureIds: carryOver.preservedFeatureIds,
			});
		}

		const { expiredCustomerProduct } =
			await customerProductActions.expireAndActivateDefault({
				ctx,
				customerProduct,
				fullCustomer,
				collector: eventContext,
			});

		expiredCustomerProducts.push(expiredCustomerProduct);
	}

	// Cache expired products so invoice.created can access them for usage-based billing
	if (expiredCustomerProducts.length > 0) {
		await customerProductActions.expiredCache.set({
			ctx,
			stripeSubscriptionId: stripeSubscription.id,
			customerProducts: expiredCustomerProducts,
		});
	}
};
