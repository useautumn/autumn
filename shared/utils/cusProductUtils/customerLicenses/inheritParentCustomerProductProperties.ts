import type { FullCusProduct } from "../../../models/cusProductModels/cusProductModels.js";

/** Lifecycle fields a seat mirrors from its parent customer product. */
const INHERITED_FIELDS = ["status", "subscription_ids", "canceled_at"] as const;

/**
 * Seats own no lifecycle: resolve each assignment's pool to its (live) parent
 * customer product and mirror the parent's lifecycle fields onto the seat.
 * Seats whose parent is absent from the set are left untouched — the orphan
 * sweep owns those.
 */
export const inheritParentCustomerProductProperties = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}): void => {
	const byId = new Map(
		customerProducts.map((customerProduct) => [
			customerProduct.id,
			customerProduct,
		]),
	);

	for (const customerProduct of customerProducts) {
		const parentCustomerLicense = customerProduct.parent_customer_license;
		if (!parentCustomerLicense) continue;

		const parent = byId.get(parentCustomerLicense.parent_customer_product_id);
		if (!parent || parent.id === customerProduct.id) continue;

		for (const field of INHERITED_FIELDS) {
			// biome-ignore lint/suspicious/noExplicitAny: keyed copy over a const field list
			(customerProduct as any)[field] = parent[field];
		}
	}
};
