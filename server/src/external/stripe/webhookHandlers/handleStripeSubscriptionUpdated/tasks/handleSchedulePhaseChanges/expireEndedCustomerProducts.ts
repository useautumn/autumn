import { type FullCusProduct, hasCustomerProductEnded } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { trackCustomerProductUpdate } from "../../../common/trackCustomerProductUpdate";
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
	const { customerProducts, fullCustomer, stripeSubscription, nowMs } =
		eventContext;

	const expiredCustomerProducts: FullCusProduct[] = [];

	for (const customerProduct of customerProducts) {
		if (!hasCustomerProductEnded(customerProduct, { nowMs })) continue;

		logger.info(
			`Expiring product: ${customerProduct.product.name}${customerProduct.entity_id ? `@${customerProduct.entity_id}` : ""}`,
		);

		const { updates } = await customerProductActions.expireAndActivateDefault({
			ctx,
			customerProduct,
			fullCustomer,
		});

		expiredCustomerProducts.push(customerProduct);

		trackCustomerProductUpdate({
			eventContext,
			customerProduct,
			updates,
		});
	}

	// Cache expired products so invoice.created can access them for usage-based billing
	if (expiredCustomerProducts.length > 0) {
		await customerProductActions.expiredCache.set({
			stripeSubscriptionId: stripeSubscription.id,
			customerProducts: expiredCustomerProducts,
		});
	}
};
