import { type FullCusProduct, hasCustomerProductEnded } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { expireAndActivateWithTracking } from "../../../common";
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
	const { customerProducts, stripeSubscription, nowMs } = eventContext;

	const expiredCustomerProducts: FullCusProduct[] = [];

	// Iterate over a snapshot: `expireAndActivateWithTracking` may insert a
	// default product (via `trackCustomerProductInsertion`), which `push`es
	// onto `customerProducts`. Without the snapshot the for-of would then
	// iterate the newly inserted default product as an extra pass.
	for (const customerProduct of [...customerProducts]) {
		const shouldExpire = hasCustomerProductEnded(customerProduct, { nowMs });

		if (!shouldExpire) continue;

		logger.info(
			`Expiring product: ${customerProduct.product.name}${customerProduct.entity_id ? `@${customerProduct.entity_id}` : ""}`,
		);

		const { expiredCustomerProduct } = await expireAndActivateWithTracking({
			ctx,
			eventContext,
			customerProduct,
		});

		expiredCustomerProducts.push(expiredCustomerProduct);
	}

	// Cache expired products so invoice.created can access them for usage-based billing
	if (expiredCustomerProducts.length > 0) {
		await customerProductActions.expiredCache.set({
			stripeSubscriptionId: stripeSubscription.id,
			customerProducts: expiredCustomerProducts,
		});
	}
};
