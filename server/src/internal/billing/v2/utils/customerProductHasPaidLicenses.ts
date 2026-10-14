import type { FullCusProduct } from "@autumn/shared";

export const customerProductHasPaidLicenses = (
	customerProduct: FullCusProduct,
): boolean =>
	(customerProduct.customer_licenses ?? []).some(
		(customerLicense) => customerLicense.paid_quantity > 0,
	);
