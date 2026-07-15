import {
	type CustomerLicenseQuantity,
	customerProductHasRelevantStatus,
	type FullCusProduct,
	type FullCustomerLicense,
	type FullProduct,
} from "@autumn/shared";
import { generateId, nullish } from "@/utils/genUtils";

/**
 * Customer licenses born with a new parent customer product — one per catalog
 * link, scheduled parents included (their rows wait, empty, until activation
 * makes them adoptable). Assignments and entity-scoped products get none.
 */
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
	return (fullProduct.licenses ?? []).flatMap((link) => {
		const totalQuantity =
			customerLicenseQuantities?.find(
				(licenseQuantity) => licenseQuantity.licensePlanId === link.product.id,
			)?.totalQuantity ?? 0;
		const paidQuantity = Math.max(0, totalQuantity - link.included);
		const granted = link.included + paidQuantity;
		if (granted === 0) return [];

		return [
			{
				id: generateId("cus_lic"),
				// Fresh identity; transitions overwrite it with the predecessor's.
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
			},
		];
	});
};
