import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";

export const filterCustomerProductsByStripeSubscriptionId = ({
	customerProducts,
	stripeSubscriptionId,
}: {
	customerProducts: FullCusProduct[];
	stripeSubscriptionId?: string;
}) => {
	return customerProducts.filter((customerProduct) => {
		if (!stripeSubscriptionId) {
			return (
				customerProduct.subscription_ids?.length === 0 ||
				!customerProduct.subscription_ids
			);
		}

		return customerProduct.subscription_ids?.includes(stripeSubscriptionId);
	});
};
