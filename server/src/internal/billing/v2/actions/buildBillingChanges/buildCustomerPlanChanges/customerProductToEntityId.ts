import type { Entity, FullCusProduct } from "@autumn/shared";

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
