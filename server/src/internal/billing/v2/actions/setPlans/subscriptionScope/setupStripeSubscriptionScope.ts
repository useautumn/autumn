import {
	customerProductsToStripeSubscriptionIds,
	type FullCustomer,
	filterCustomerProductsByActiveStatuses,
	filterCustomerProductsByStripeSubscriptionScope,
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
		customerProducts: filterCustomerProductsByActiveStatuses({
			customerProducts: fullCustomer.customer_products,
		}),
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
