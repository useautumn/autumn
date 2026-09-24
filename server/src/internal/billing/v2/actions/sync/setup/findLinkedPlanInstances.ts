import {
	cp,
	type FullCusProduct,
	type FullCustomer,
	type SyncProductContext,
} from "@autumn/shared";

/** Active instances of the plan already linked to this Stripe subscription. */
export const findLinkedPlanInstances = ({
	fullCustomer,
	fullProduct,
	stripeSubscriptionId,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	fullProduct: SyncProductContext["fullProduct"];
	stripeSubscriptionId: string;
	internalEntityId?: string;
}): FullCusProduct[] =>
	fullCustomer.customer_products.filter((customerProduct) => {
		if (customerProduct.product?.id !== fullProduct.id) return false;
		if ((customerProduct.internal_entity_id ?? undefined) !== internalEntityId)
			return false;
		return cp(customerProduct)
			.hasActiveStatus()
			.onStripeSubscription({ stripeSubscriptionId }).valid;
	});
