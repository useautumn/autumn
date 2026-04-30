import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";

/**
 * Filter customer products to those that have at least one customer_price
 * linked to a price for the given feature_id.
 *
 * "Paid for feature X" semantics — the customer is being billed for usage of
 * this feature on the cusProduct.
 */
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
