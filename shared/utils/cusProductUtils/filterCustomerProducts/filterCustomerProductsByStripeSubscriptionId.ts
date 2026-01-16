import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";

/**
 * Filter customer products by stripe subscription id, returns all products without a stripe subscription id if no stripe subscription id is provided
 * @param customerProducts - The customer products to filter
 * @param stripeSubscriptionId - The stripe subscription id to filter by
 * @returns The filtered customer products
 */
export const filterCustomerProductsByStripeSubscriptionId = ({
	customerProducts,
	stripeSubscriptionId,
}: {
	customerProducts: FullCusProduct[];
	stripeSubscriptionId?: string;
}) => {
	return customerProducts.filter((customerProduct) =>
		stripeSubscriptionId
			? customerProduct.subscription_ids?.includes(stripeSubscriptionId)
			: !customerProduct.subscription_ids?.length,
	);
};
