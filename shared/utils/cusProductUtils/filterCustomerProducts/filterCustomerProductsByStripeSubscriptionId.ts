import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";

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
