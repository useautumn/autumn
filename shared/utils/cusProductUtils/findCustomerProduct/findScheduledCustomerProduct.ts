import type { FullCustomer } from "../../../models/cusModels/fullCusModel";
import { CusProductStatus } from "../../../models/cusProductModels/cusProductEnums";
import {
	isCusProductOnEntity,
	isCustomerProductMain,
} from "../classifyCusProduct";

/**
 * Finds the scheduled customer product in a given group for a customer.
 * Filters by product group, scheduled status, and entity.
 */
export const findMainScheduledCustomerProductByGroup = ({
	fullCustomer,
	productGroup,
}: {
	fullCustomer: FullCustomer;
	productGroup: string;
}) => {
	return fullCustomer.customer_products.find((customerProduct) => {
		const productGroupMatches = customerProduct.product.group === productGroup;

		const statusMatches = customerProduct.status === CusProductStatus.Scheduled;

		const entityMatches = isCusProductOnEntity({
			cusProduct: customerProduct,
			internalEntityId: fullCustomer.entity?.internal_id,
		});

		const isMainProduct = isCustomerProductMain(customerProduct);

		return (
			productGroupMatches && statusMatches && entityMatches && isMainProduct
		);
	});
};
