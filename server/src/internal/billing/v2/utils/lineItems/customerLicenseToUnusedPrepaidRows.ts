import {
	customerLicenseToUsage,
	type FullCustomerLicense,
	isFixedPrice,
	type LicenseBillingPriceRow,
} from "@autumn/shared";

/**
 * The unassigned paid buffer, priced in-memory at the current plan license
 * definition — it has no seat rows by design. Empty when the link is broken
 * (reconcile owns those) or nothing paid remains unassigned.
 */
export const customerLicenseToUnusedPrepaidRows = ({
	customerLicense,
}: {
	customerLicense: FullCustomerLicense;
}): LicenseBillingPriceRow[] => {
	const { planLicense } = customerLicense;
	if (!planLicense) return [];

	const used = customerLicenseToUsage({ customerLicense });
	const billableUsed = Math.max(0, used - planLicense.included);
	const quantity = Math.max(0, customerLicense.paid_quantity - billableUsed);
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
