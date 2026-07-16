import type { FullCusProduct } from "@autumn/shared";

/** License pools bill through their parent's subscription when they carry
 * paid capacity — a priceless parent still needs the sub link. */
export const customerProductHasPaidLicenses = (
	customerProduct: FullCusProduct,
): boolean =>
	(customerProduct.customer_licenses ?? []).some(
		(customerLicense) => customerLicense.paid_quantity > 0,
	);
