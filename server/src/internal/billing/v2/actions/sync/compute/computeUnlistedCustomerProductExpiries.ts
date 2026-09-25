import {
	ACTIVE_STATUSES,
	type CustomerProductUpdate,
	filterCustomerProductsByStripeSubscriptionId,
	type SyncBillingContext,
} from "@autumn/shared";
import { expireCustomerProduct } from "./computeSyncImmediatePhase";

/** Ids of live plans some synced plan carries forward, whether it replaces them
 * or only changes their seats. */
const listedCustomerProductIds = ({
	syncContext,
}: {
	syncContext: SyncBillingContext;
}): Set<string> => {
	const productContexts = [
		...(syncContext.immediatePhase?.productContexts ?? []),
		...syncContext.futurePhases.flatMap((phase) => phase.productContexts),
		...syncContext.unscheduledProductContexts,
	];
	return new Set(
		productContexts.flatMap(({ currentCustomerProduct }) =>
			currentCustomerProduct ? [currentCustomerProduct.id] : [],
		),
	);
};

/** Live plans on the subscription that no synced plan carries forward, when the
 * caller sent the full plan list — leaving one out means removing it. */
export const computeUnlistedCustomerProductExpiries = ({
	syncContext,
}: {
	syncContext: SyncBillingContext;
}): CustomerProductUpdate[] => {
	const { expireUnlistedPlans, stripeSubscription, fullCustomer } = syncContext;
	if (!expireUnlistedPlans || !stripeSubscription) return [];

	const listedIds = listedCustomerProductIds({ syncContext });

	return filterCustomerProductsByStripeSubscriptionId({
		customerProducts: fullCustomer.customer_products,
		stripeSubscriptionId: stripeSubscription.id,
	})
		.filter(
			(customerProduct) =>
				ACTIVE_STATUSES.includes(customerProduct.status) &&
				!listedIds.has(customerProduct.id),
		)
		.map((customerProduct) =>
			expireCustomerProduct({
				customerProduct,
				currentEpochMs: syncContext.currentEpochMs,
			}),
		);
};
