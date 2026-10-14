import {
	type CustomerLicenseQuantity,
	customerProductHasRelevantStatus,
	type FullCusProduct,
	type FullCustomerLicense,
	type FullProduct,
} from "@autumn/shared";
import { generateId, nullish } from "@/utils/genUtils";

export const initCustomerLicenses = ({
	customerProduct,
	fullProduct,
	customerLicenseQuantities,
}: {
	customerProduct: FullCusProduct;
	fullProduct: FullProduct;
	customerLicenseQuantities?: CustomerLicenseQuantity[];
}): FullCustomerLicense[] => {
	const ownsLicenses =
		nullish(customerProduct.internal_entity_id) &&
		nullish(customerProduct.customer_license_link_id) &&
		customerProductHasRelevantStatus(customerProduct);
	if (!ownsLicenses) return [];

	const now = Date.now();
	return (fullProduct.licenses ?? []).map((link) => {
		const totalQuantity =
			customerLicenseQuantities?.find(
				(licenseQuantity) => licenseQuantity.licensePlanId === link.product.id,
			)?.totalQuantity ?? 0;
		const paidQuantity = Math.max(0, totalQuantity - link.included);
		const granted = link.included + paidQuantity;

		return {
			id: generateId("cus_lic"),
			link_id: generateId("cus_lic_link"),
			internal_customer_id: customerProduct.internal_customer_id,
			parent_customer_product_id: customerProduct.id,
			license_internal_product_id: link.product.internal_id,
			plan_license_id: link.id,
			granted,
			remaining: granted,
			paid_quantity: paidQuantity,
			created_at: now,
			updated_at: now,
			planLicense: link,
		};
	});
};
