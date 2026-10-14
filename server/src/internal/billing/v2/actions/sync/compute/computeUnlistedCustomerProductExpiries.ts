import {
	ACTIVE_STATUSES,
	type CustomerProductUpdate,
	filterCustomerProductsByStripeSubscriptionScope,
	type SyncBillingContext,
} from "@autumn/shared";
import { expireCustomerProduct } from "./computeSyncImmediatePhase";

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
	return new Set([
		...productContexts.flatMap(({ currentCustomerProduct }) =>
			currentCustomerProduct ? [currentCustomerProduct.id] : [],
		),
		...syncContext.retainedCustomerProducts.map(({ id }) => id),
	]);
};

export const computeUnlistedCustomerProductExpiries = ({
	syncContext,
}: {
	syncContext: SyncBillingContext;
}): CustomerProductUpdate[] => {
	const { expireUnlistedPlans, stripeSubscription, fullCustomer } = syncContext;
	if (!expireUnlistedPlans || !stripeSubscription) return [];

	const listedIds = listedCustomerProductIds({ syncContext });

	return filterCustomerProductsByStripeSubscriptionScope({
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
