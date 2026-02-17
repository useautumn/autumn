import {
	type FullCustomer,
	isCusProductOnEntity,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";

export const findTargetCustomerProduct = ({
	params,
	fullCustomer,
}: {
	params: UpdateSubscriptionV1Params;
	fullCustomer: FullCustomer;
}) => {
	const cusProducts = fullCustomer.customer_products;
	const productId = params.product_id;
	const internalEntityId = fullCustomer.entity?.internal_id;
	const cusProductId = params.customer_product_id;

	if (cusProductId) {
		return cusProducts.find((cp) => cp.id === cusProductId);
	}

	return cusProducts.find((cp) => {
		const productIdMatch = cp.product.id === productId;
		const entityIdMatch = isCusProductOnEntity({
			cusProduct: cp,
			internalEntityId,
		});

		return productIdMatch && entityIdMatch;
	});
};
