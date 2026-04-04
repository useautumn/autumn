import {
	CusProductStatus,
	type FullCusProduct,
	type ProductV2,
} from "@autumn/shared";

const ACTIVE_STATUSES = new Set([
	CusProductStatus.Active,
	CusProductStatus.Trialing,
	CusProductStatus.PastDue,
]);

/** Check if the customer has an active main product in the same group as the selected plan. */
export const hasActiveProductInGroup = ({
	planId,
	products,
	customerProducts,
}: {
	planId: string;
	products: ProductV2[];
	customerProducts: FullCusProduct[];
}): boolean => {
	const selectedProduct = products.find((p) => p.id === planId);
	if (!selectedProduct?.group) return false;

	return customerProducts.some(
		(customerProduct) =>
			ACTIVE_STATUSES.has(customerProduct.status) &&
			!customerProduct.product.is_add_on &&
			customerProduct.product.group === selectedProduct.group,
	);
};
