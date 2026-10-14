import type { FullCusProduct } from "../../../models/cusProductModels/cusProductModels.js";

export const inheritParentCustomerProductProperties = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}): void => {
	for (const customerProduct of customerProducts) {
		const parentCustomerProduct = customerProduct.parent_customer_product;
		if (!customerProduct.parent_customer_license || !parentCustomerProduct)
			continue;

		customerProduct.status = parentCustomerProduct.status;
		customerProduct.subscription_ids = parentCustomerProduct.subscription_ids;
		customerProduct.canceled_at = parentCustomerProduct.canceled_at;
	}
};
