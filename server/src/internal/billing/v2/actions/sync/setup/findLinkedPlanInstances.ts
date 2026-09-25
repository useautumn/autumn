import { cp, type FullCusProduct, type FullCustomer } from "@autumn/shared";

export const findLinkedPlanInstances = ({
	fullCustomer,
	productId,
	stripeSubscriptionId,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	productId: string;
	stripeSubscriptionId: string;
	internalEntityId?: string;
}): FullCusProduct[] =>
	fullCustomer.customer_products.filter((customerProduct) => {
		if (customerProduct.product?.id !== productId) return false;
		if ((customerProduct.internal_entity_id ?? undefined) !== internalEntityId)
			return false;
		return cp(customerProduct)
			.hasActiveStatus()
			.onStripeSubscription({ stripeSubscriptionId }).valid;
	});
