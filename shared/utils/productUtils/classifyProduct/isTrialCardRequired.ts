import type { FullProduct } from "@models/productModels/productModels";
import { isFreeProduct } from "./classifyProductUtils";

/** Free plans have no card gate (attach branches on price count), so a stored `true` is inert and only misleads API consumers. */
export const isTrialCardRequired = ({
	product,
}: {
	product: FullProduct;
}): boolean => {
	if (isFreeProduct({ product })) return false;
	return product.free_trial?.card_required ?? false;
};
