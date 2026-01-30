import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { StripeSubscriptionDeletedContext } from "../handleStripeSubscriptionDeleted/setupStripeSubscriptionDeletedContext";
import type { StripeSubscriptionUpdatedContext } from "../handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";

type EventContext =
	| StripeSubscriptionUpdatedContext
	| StripeSubscriptionDeletedContext;

const hasDeletedCustomerProducts = (
	context: EventContext,
): context is StripeSubscriptionDeletedContext => {
	return "deletedCustomerProducts" in context;
};

/**
 * Logs all customer product updates and deletions in a structured format for easy querying in Axiom.
 * Called at the end of subscription handlers to provide a summary.
 */
export const logCustomerProductUpdates = ({
	ctx,
	eventContext,
	logPrefix,
}: {
	ctx: StripeWebhookContext;
	eventContext: EventContext;
	logPrefix: string;
}): void => {
	const { logger } = ctx;
	const { updatedCustomerProducts } = eventContext;

	const updates = updatedCustomerProducts.map(
		({ customerProduct, updates }) => ({
			id: customerProduct.id,
			productId: customerProduct.product.id,
			productName: customerProduct.product.name,
			statusBefore: customerProduct.status,
			updates,
		}),
	);

	const deletions = hasDeletedCustomerProducts(eventContext)
		? eventContext.deletedCustomerProducts.map((customerProduct) => ({
				id: customerProduct.id,
				productId: customerProduct.product.id,
				productName: customerProduct.product.name,
				status: customerProduct.status,
			}))
		: [];

	if (updates.length === 0 && deletions.length === 0) return;

	addToExtraLogs({
		ctx,
		extras: {
			updates,
			deletions,
		},
	});

	// logger.info(`${logPrefix} Customer product changes`, {
	// 	updates,
	// 	deletions,
	// });
};
