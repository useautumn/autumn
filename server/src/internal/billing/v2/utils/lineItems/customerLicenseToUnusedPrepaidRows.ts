import {
	type FullCustomerLicense,
	isFixedPrice,
	type LicenseBillingPriceRow,
} from "@autumn/shared";

/** Prices the paid seat quantity without persisted assignment rows. */
export const customerLicenseToUnusedPrepaidRows = ({
	customerLicense,
	billableAssignedQuantity,
}: {
	customerLicense: FullCustomerLicense;
	billableAssignedQuantity: number;
}): LicenseBillingPriceRow[] => {
	const { planLicense } = customerLicense;
	if (!planLicense) return [];

	const quantity = Math.max(
		0,
		customerLicense.paid_quantity - billableAssignedQuantity,
	);
	if (quantity === 0) return [];

	// License plans carry a single fixed price for now.
	const fixedPrice = planLicense.product.prices.find((price) =>
		isFixedPrice(price),
	);
	if (!fixedPrice) return [];

	return [
		{
			customerProductId: customerLicense.parent_customer_product_id,
			price: fixedPrice,
			quantity,
			source: {
				type: "customer_license_unused_prepaid" as const,
				customerLicenseId: customerLicense.id,
			},
		},
	];
};
