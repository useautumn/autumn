import type { FullCustomer } from "@models/cusModels/fullCusModel";
import { cp } from "@utils/cusProductUtils/classifyCustomerProduct/cpBuilder";

/**
 * Finds the active main (not add-on, not one-off) customer product in a given group for a customer.
 * Filters by product group, entity, active status, non-add-on, and non-one-off products.
 */
export const findMainActiveCustomerProductByGroup = ({
	fullCus,
	productGroup,
	internalEntityId,
}: {
	fullCus: FullCustomer;
	productGroup: string;
	internalEntityId?: string;
}) => {
	if (!internalEntityId) {
		internalEntityId = fullCus.entity?.internal_id;
	}

	const cusProducts = fullCus.customer_products;

	const activeMainCusProduct = cusProducts.find((customerProduct) => {
		const { valid } = cp(customerProduct)
			.activeRecurring()
			.main()
			.hasProductGroup({ productGroup })
			.onEntity({ internalEntityId });

		return valid;
	});

	return activeMainCusProduct;
};

export const findActiveCustomerProductById = ({
	fullCustomer,
	productId,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	productId: string;
	internalEntityId?: string;
}) => {
	const cusProducts = fullCustomer.customer_products;

	const activeMainCusProduct = cusProducts.find((customerProduct) => {
		const { valid } = cp(customerProduct)
			.activeRecurring()
			.main()
			.hasProductId({ productId })
			.onEntity({ internalEntityId });

		return valid;
	});

	return activeMainCusProduct;
};
