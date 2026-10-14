import type { FullProduct } from "@models/productModels/productModels";
import { isFreeProduct } from "./classifyProductUtils";

export const isTrialCardRequired = ({
	product,
}: {
	product: FullProduct;
}): boolean => {
	if (isFreeProduct({ product })) return false;
	return product.free_trial?.card_required ?? false;
};
