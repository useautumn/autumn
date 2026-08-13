import type { FullCusProduct } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { BillingChangeCollector } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/billingChangeCollector";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

/** Only the sub.updated context carries carry-overs, so it stays optional here. */
type LoggableEventContext = BillingChangeCollector & {
	oneOffPrepaidCarryOvers?: unknown[];
};

const toIdentity = (customerProduct: FullCusProduct) => ({
	id: customerProduct.id,
	productId: customerProduct.product.id,
	productName: customerProduct.product.name,
});

const toStatusSummary = (customerProduct: FullCusProduct) => ({
	...toIdentity(customerProduct),
	status: customerProduct.status,
});

/**
 * Logs all customer product updates, deletions, and insertions in a structured format for easy querying in Axiom.
 * Called at the end of subscription handlers to provide a summary.
 */
export const logCustomerProductUpdates = ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: LoggableEventContext;
}): void => {
	const {
		updatedCustomerProducts,
		deletedCustomerProducts,
		insertedCustomerProducts,
		oneOffPrepaidCarryOvers = [],
	} = eventContext;

	const updates = updatedCustomerProducts.map(
		({ customerProduct, updates }) => ({
			...toIdentity(customerProduct),
			statusBefore: customerProduct.status,
			updates,
		}),
	);

	const deletions = deletedCustomerProducts.map(toStatusSummary);
	const insertions = insertedCustomerProducts.map(toStatusSummary);

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
