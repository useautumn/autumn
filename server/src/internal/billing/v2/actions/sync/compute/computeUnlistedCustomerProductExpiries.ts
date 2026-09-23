import {
	ACTIVE_STATUSES,
	type CustomerProductUpdate,
	filterCustomerProductsByStripeSubscriptionId,
	type SyncBillingContext,
} from "@autumn/shared";
import { expireCustomerProduct } from "./computeSyncImmediatePhase";

/** Live plans on the subscription that no synced plan replaces, when the
 * caller sent the full plan list — leaving one out means removing it. */
export const computeUnlistedCustomerProductExpiries = ({
	syncContext,
	updateCustomerProducts,
}: {
	syncContext: SyncBillingContext;
	updateCustomerProducts: CustomerProductUpdate[];
}): CustomerProductUpdate[] => {
	const { expireUnlistedPlans, stripeSubscription, fullCustomer } = syncContext;
	if (!expireUnlistedPlans || !stripeSubscription) return [];

	const alreadyUpdatedIds = new Set(
		updateCustomerProducts.map(({ customerProduct }) => customerProduct.id),
	);

	return filterCustomerProductsByStripeSubscriptionId({
		customerProducts: fullCustomer.customer_products,
		stripeSubscriptionId: stripeSubscription.id,
	})
		.filter(
			(customerProduct) =>
				ACTIVE_STATUSES.includes(customerProduct.status) &&
				!alreadyUpdatedIds.has(customerProduct.id),
		)
		.map((customerProduct) =>
			expireCustomerProduct({
				customerProduct,
				currentEpochMs: syncContext.currentEpochMs,
			}),
		);
};
