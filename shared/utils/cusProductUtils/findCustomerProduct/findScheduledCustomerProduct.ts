import type { FullCustomer } from "../../../models/cusModels/fullCusModel";
import { CusProductStatus } from "../../../models/cusProductModels/cusProductEnums";
import {
	isCusProductOnEntity,
	isCustomerProductMain,
} from "../classifyCustomerProduct/classifyCustomerProduct";
import { cp } from "../classifyCustomerProduct/cpBuilder";

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

export const findScheduledCustomerProductById = ({
	fullCustomer,
	productId,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	productId: string;
	internalEntityId?: string | null;
}) => {
	if (!internalEntityId) {
		internalEntityId = fullCustomer.entity?.internal_id;
	}

	return fullCustomer.customer_products.find((customerProduct) => {
		const { valid } = cp(customerProduct)
			.scheduled()
			.hasProductId({ productId })
			.onEntity({ internalEntityId: internalEntityId ?? undefined });

		return valid;
	});
};
