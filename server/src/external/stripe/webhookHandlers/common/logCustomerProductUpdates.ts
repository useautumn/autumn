import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { StripeSubscriptionDeletedContext } from "../handleStripeSubscriptionDeleted/setupStripeSubscriptionDeletedContext";
import type { StripeSubscriptionUpdatedContext } from "../handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";

type EventContext =
	| StripeSubscriptionUpdatedContext
	| StripeSubscriptionDeletedContext;

export const logCustomerProductUpdates = ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: EventContext;
}): void => {
	const {
		updatedCustomerProducts,
		deletedCustomerProducts,
		insertedCustomerProducts,
	} = eventContext;

	const updates = updatedCustomerProducts.map(
		({ customerProduct, updates }) => ({
			id: customerProduct.id,
			productId: customerProduct.product.id,
			productName: customerProduct.product.name,
			statusBefore: customerProduct.status,
			updates,
		}),
	);

	const deletions = deletedCustomerProducts.map((customerProduct) => ({
		id: customerProduct.id,
		productId: customerProduct.product.id,
		productName: customerProduct.product.name,
		status: customerProduct.status,
	}));

	const insertions = insertedCustomerProducts.map((customerProduct) => ({
		id: customerProduct.id,
		productId: customerProduct.product.id,
		productName: customerProduct.product.name,
		status: customerProduct.status,
	}));

	const oneOffPrepaidCarryOvers =
		"oneOffPrepaidCarryOvers" in eventContext
			? eventContext.oneOffPrepaidCarryOvers
			: [];

	if (
		updates.length === 0 &&
		deletions.length === 0 &&
		insertions.length === 0 &&
		oneOffPrepaidCarryOvers.length === 0
	)
		return;

	addToExtraLogs({
		ctx,
		extras: {
			updates,
			deletions,
			insertions,
			...(oneOffPrepaidCarryOvers.length > 0
				? { oneOffPrepaidCarryOvers }
				: {}),
		},
	});
};
