import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import type { FullCusProduct } from "../../../models/cusProductModels/cusProductModels.js";

export const cusProductToCusEnts = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}): FullCusEntWithFullCusProduct[] => {
	return cusProduct.customer_entitlements.map((ce) => ({
		...ce,
		customer_product: cusProduct,
	}));
};
