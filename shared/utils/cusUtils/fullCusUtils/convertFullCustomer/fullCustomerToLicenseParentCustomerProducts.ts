import type { FullCustomer } from "../../../../models/cusModels/fullCusModel.js";
import type { FullCusProduct } from "../../../../models/cusProductModels/cusProductModels.js";
import { isCustomerProductLicenseParent } from "../../../cusProductUtils/classifyCustomerProduct/classifyCustomerProduct.js";

/** The customer's live license-parent products — the pool owners. */
export const fullCustomerToLicenseParentCustomerProducts = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}): FullCusProduct[] =>
	fullCustomer.customer_products.filter((customerProduct) =>
		isCustomerProductLicenseParent(customerProduct),
	);
