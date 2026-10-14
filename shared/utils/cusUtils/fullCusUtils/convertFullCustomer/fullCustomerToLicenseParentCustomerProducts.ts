import type { FullCustomer } from "../../../../models/cusModels/fullCusModel.js";
import type { FullCusProduct } from "../../../../models/cusProductModels/cusProductModels.js";
import { isCustomerProductLicenseParent } from "../../../cusProductUtils/classifyCustomerProduct/classifyCustomerProduct.js";

export const fullCustomerToLicenseParentCustomerProducts = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}): FullCusProduct[] =>
	fullCustomer.customer_products.filter((customerProduct) =>
		isCustomerProductLicenseParent(customerProduct),
	);
