import type { FullCustomer } from "../../../../models/cusModels/fullCusModel.js";
import type { FullCustomerLicense } from "../../../../models/licenseModels/fullCustomerLicense.js";

export const fullCustomerToCustomerLicenses = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}): FullCustomerLicense[] =>
	fullCustomer.customer_products.flatMap(
		(customerProduct) => customerProduct.customer_licenses ?? [],
	);
