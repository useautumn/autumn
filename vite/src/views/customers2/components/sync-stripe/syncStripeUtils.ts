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
	if (!selectedProduct) return false;

	const selectedGroup = selectedProduct.group || "";

	return customerProducts.some(
		(customerProduct) =>
			ACTIVE_STATUSES.has(customerProduct.status) &&
			!customerProduct.product.is_add_on &&
			(customerProduct.product.group || "") === selectedGroup,
	);
};
