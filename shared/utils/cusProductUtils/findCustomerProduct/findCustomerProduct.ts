import type { FullCustomer } from "@models/cusModels/fullCusModel";

export const findCustomerProductById = ({
	fullCustomer,
	customerProductId,
}: {
	fullCustomer?: FullCustomer;
	customerProductId: string;
}) => {
	if (!fullCustomer) return undefined;

	return fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.id === customerProductId,
	);
};
