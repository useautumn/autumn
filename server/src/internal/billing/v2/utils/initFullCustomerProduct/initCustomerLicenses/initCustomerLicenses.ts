import {
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
}: {
	customerProduct: FullCusProduct;
	fullProduct: FullProduct;
}): FullCustomerLicense[] => {
	const ownsLicenses =
		nullish(customerProduct.internal_entity_id) &&
		nullish(customerProduct.license_parent_customer_product_id) &&
		customerProductHasRelevantStatus(customerProduct);
	if (!ownsLicenses) return [];

	const now = Date.now();
	return (fullProduct.licenses ?? [])
		.filter((link) => link.included > 0)
		.map((link) => ({
			id: generateId("cus_lic"),
			internal_customer_id: customerProduct.internal_customer_id,
			parent_customer_product_id: customerProduct.id,
			license_internal_product_id: link.product.internal_id,
			plan_license_id: link.id,
			granted: link.included,
			remaining: link.included,
			created_at: now,
			updated_at: now,
			license: link,
		}));
};
