import type { FullProduct } from "@autumn/shared";

/** Flatten listFull rows plus nested license parents and payload-base variants.
 * Prefer a row that already carries reverse `parent_plan_licenses`. */
export const collectProductStateRows = ({
	products,
	payloadPlanIds,
}: {
	products: FullProduct[];
	payloadPlanIds?: string[];
}): FullProduct[] => {
	const byInternalId = new Map<string, FullProduct>();
	const payloadIds = payloadPlanIds ? new Set(payloadPlanIds) : null;

	const add = (product: FullProduct | null | undefined) => {
		if (!product) return;
		const existing = byInternalId.get(product.internal_id);
		if (!existing) {
			byInternalId.set(product.internal_id, product);
			return;
		}
		const existingHasReverse = (existing.parent_plan_licenses ?? []).length > 0;
		const incomingHasReverse = (product.parent_plan_licenses ?? []).length > 0;
		if (!existingHasReverse && incomingHasReverse) {
			byInternalId.set(product.internal_id, product);
		}
	};

	for (const product of products) {
		add(product);
	}
	for (const product of products) {
		for (const link of product.parent_plan_licenses ?? []) {
			add(link.product);
		}
		if (payloadIds && !payloadIds.has(product.id)) continue;
		for (const variant of product.variants ?? []) {
			add(variant);
		}
		for (const link of product.licenses ?? []) {
			add(link.product);
			add(link.base_product);
		}
	}

	return [...byInternalId.values()];
};
