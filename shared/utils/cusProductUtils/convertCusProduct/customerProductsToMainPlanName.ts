import type { FullCusProduct } from "../../../models/cusProductModels/cusProductModels.js";

/** A subscription is named after its main plan, or its first plan when it only bills add-ons. */
export const customerProductsToMainPlanName = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}): string | null => {
	const namedProduct =
		customerProducts.find(
			(customerProduct) => !customerProduct.product?.is_add_on,
		) ?? customerProducts[0];
	if (!namedProduct) return null;
	return namedProduct.product?.name ?? namedProduct.product_id;
};
