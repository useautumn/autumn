import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import type { FullProduct } from "@models/productModels/productModels";
import type { SharedContext } from "../../../types";
import { customerProductEligibleForDefaultProduct } from "../classifyCustomerProduct/classifyCustomerProduct";

export const customerProductToDefaultProduct = ({
	ctx,
	customerProduct,
	defaultProducts,
}: {
	ctx: SharedContext;
	customerProduct: FullCusProduct;
	defaultProducts: FullProduct[];
}) => {
	const eligibleForDefaultProduct = customerProductEligibleForDefaultProduct({
		ctx,
		customerProduct,
	});

	if (!eligibleForDefaultProduct) return undefined;

	return defaultProducts.find(
		(p) =>
			p.group === customerProduct.product.group &&
			p.id !== customerProduct.product.id,
	);
};
