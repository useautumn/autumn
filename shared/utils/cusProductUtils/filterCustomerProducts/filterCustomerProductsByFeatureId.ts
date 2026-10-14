import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";

export const filterCustomerProductsByFeatureId = ({
	customerProducts,
	featureId,
}: {
	customerProducts: FullCusProduct[];
	featureId: string;
}) => {
	return customerProducts.filter((customerProduct) =>
		customerProduct.customer_prices.some(
			(customerPrice) => customerPrice.price?.config?.feature_id === featureId,
		),
	);
};
