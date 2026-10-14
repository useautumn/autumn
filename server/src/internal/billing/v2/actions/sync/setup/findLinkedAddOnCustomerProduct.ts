import {
	ACTIVE_STATUSES,
	cp,
	type FullCusProduct,
	type FullCustomer,
	isCustomerProductUnlinkedFree,
	type SyncProductContext,
} from "@autumn/shared";

export const findLinkedAddOnCustomerProduct = ({
	fullCustomer,
	fullProduct,
	stripeSubscriptionId,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	fullProduct: SyncProductContext["fullProduct"];
	stripeSubscriptionId: string;
	internalEntityId?: string;
}): FullCusProduct | undefined => {
	const sameAddOnInstances = fullCustomer.customer_products.filter(
		(customerProduct) =>
			customerProduct.product?.id === fullProduct.id &&
			(customerProduct.internal_entity_id ?? undefined) === internalEntityId,
	);

	return (
		sameAddOnInstances.find(
			(customerProduct) =>
				cp(customerProduct).hasActiveStatus().onStripeSubscription({
					stripeSubscriptionId,
				}).valid,
		) ??
		sameAddOnInstances.find(
			(customerProduct) =>
				ACTIVE_STATUSES.includes(customerProduct.status) &&
				isCustomerProductUnlinkedFree(customerProduct),
		)
	);
};
