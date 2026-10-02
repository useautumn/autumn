import {
	customerProductsToStripeSubscriptionIds,
	type FullCustomer,
	filterCustomerProductsByStripeSubscriptionScope,
	STRIPE_LINKED_STATUSES,
	type StripeSubscriptionScope,
} from "@autumn/shared";

export const setupStripeSubscriptionScope = ({
	fullCustomer,
	stripeSubscriptionId,
	stripeScheduleId,
}: {
	fullCustomer: FullCustomer;
	stripeSubscriptionId?: string;
	stripeScheduleId?: string;
}): StripeSubscriptionScope | undefined => {
	if (!stripeSubscriptionId) return undefined;

	const scopedCustomerProducts =
		filterCustomerProductsByStripeSubscriptionScope({
			customerProducts: fullCustomer.customer_products,
			stripeSubscriptionId,
			stripeScheduleId,
		});
	const linkedStripeSubscriptionIds = customerProductsToStripeSubscriptionIds({
		customerProducts: fullCustomer.customer_products.filter(({ status }) =>
			STRIPE_LINKED_STATUSES.includes(status),
		),
	});

	return {
		stripeSubscriptionId,
		customerProductIds: scopedCustomerProducts.map(({ id }) => id),
		otherStripeSubscriptionIds: linkedStripeSubscriptionIds.filter(
			(linkedStripeSubscriptionId) =>
				linkedStripeSubscriptionId !== stripeSubscriptionId,
		),
	};
};
