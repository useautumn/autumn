import type { FullCustomer } from "../../models/cusModels/fullCusModel";

export const getCurrentCusProduct = ({
	fullCus,
	productId,
	productGroup,
}: {
	fullCus: FullCustomer;
	productId: string;
	productGroup: string;
}) => {
	const cusProducts = fullCus.customer_products;

	const entity = fullCus.entity;

	// 1. If entity, filter out cusProducts for that entity...?
	if (entity) {
		const filteredCusProducts = cusProducts.filter(
			(cp) => cp.internal_entity_id === entity.internal_id,
		);
	}

	// return fullCus.customer_products.find((cp) => cp.product_id === productId);
};
