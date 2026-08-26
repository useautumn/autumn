import type { Entity, FullCusProduct } from "@autumn/shared";

/**
 * Public entity id a customer product is scoped to, or null for customer-level.
 * Prefers the live entities join over the row's snapshot, which predates
 * `entity_id` on older rows.
 */
export const customerProductToEntityId = ({
	customerProduct,
	entities = [],
}: {
	customerProduct: FullCusProduct;
	entities?: Entity[];
}): string | null => {
	const internalEntityId = customerProduct.internal_entity_id;
	if (!internalEntityId) return null;

	const entity = entities.find((e) => e.internal_id === internalEntityId);
	return entity?.id ?? customerProduct.entity_id ?? null;
};
