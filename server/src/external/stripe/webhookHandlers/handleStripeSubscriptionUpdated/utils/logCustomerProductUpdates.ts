import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { StripeSubscriptionUpdatedContext } from "../stripeSubscriptionUpdatedContext";

/**
 * Logs all customer product updates in a structured format for easy querying in Axiom.
 * Called at the end of handleStripeSubscriptionUpdated to provide a summary.
 */
export const logCustomerProductUpdates = ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): void => {
	const { logger } = ctx;
	const { updatedCustomerProducts } = subscriptionUpdatedContext;

	if (updatedCustomerProducts.length === 0) return;

	const updates = updatedCustomerProducts.map(
		({ customerProduct, updates }) => ({
			id: customerProduct.id,
			product_id: customerProduct.product.id,
			product_name: customerProduct.product.name,
			status_before: customerProduct.status,
			updates,
		}),
	);

	logger.info("[subscription.updated] Customer product updates", {
		data: updates,
	});
};
