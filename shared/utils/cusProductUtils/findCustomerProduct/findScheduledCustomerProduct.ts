import type { FullCustomer } from "../../../models/cusModels/fullCusModel";
import { CusProductStatus } from "../../../models/cusProductModels/cusProductEnums";
import {
	isCusProductOnEntity,
	isCustomerProductMain,
} from "../classifyCustomerProduct/classifyCustomerProduct";

/**
 * Finds the scheduled main customer product in a given group for a customer.
 * Filters by product group, scheduled status, entity, and main product.
 *
 * @param fullCustomer - The full customer object
 * @param productGroup - The product group to search in
 * @param internalEntityId - Optional entity ID. Falls back to `fullCustomer.entity?.internal_id`
 */
export const findMainScheduledCustomerProductByGroup = ({
	fullCustomer,
	productGroup,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	productGroup: string;
	internalEntityId?: string | null;
}) => {
	if (!internalEntityId) {
		internalEntityId = fullCustomer.entity?.internal_id;
	}

	return fullCustomer.customer_products.find((customerProduct) => {
		const productGroupMatches = customerProduct.product.group === productGroup;

		const statusMatches = customerProduct.status === CusProductStatus.Scheduled;

		const entityMatches = isCusProductOnEntity({
			cusProduct: customerProduct,
			internalEntityId,
		});

		const isMainProduct = isCustomerProductMain(customerProduct);

		return (
			productGroupMatches && statusMatches && entityMatches && isMainProduct
		);
	});
};
