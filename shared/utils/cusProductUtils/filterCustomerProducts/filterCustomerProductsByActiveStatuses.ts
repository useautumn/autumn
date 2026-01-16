import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import { ACTIVE_STATUSES } from "@utils/cusProductUtils/cusProductConstants";

export const filterCustomerProductsByActiveStatuses = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}) => {
	return customerProducts.filter((customerProduct) =>
		ACTIVE_STATUSES.includes(customerProduct.status),
	);
};
