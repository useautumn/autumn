import type { FullCustomer } from "../../../../models/cusModels/fullCusModel.js";
import type { FullCustomerLicense } from "../../../../models/licenseModels/fullCustomerLicense.js";

/** Flat view of the customer licenses stitched onto customer_products —
 * customer-scoped consumers (gate, reconcile, billing rows) read this. */
export const fullCustomerToCustomerLicenses = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}): FullCustomerLicense[] =>
	fullCustomer.customer_products.flatMap(
		(customerProduct) => customerProduct.customer_licenses ?? [],
	);
