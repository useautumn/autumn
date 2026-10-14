import type { FullProduct } from "@models/productModels/productModels";
import { isFreeProduct } from "./classifyProductUtils.js";

export const isEligibleDefaultProduct = ({
	product,
	latestExistingVersion,
}: {
	product: FullProduct;
	latestExistingVersion?: number;
}): boolean => {
	if (product.base_internal_product_id) return false;
	if (
		latestExistingVersion !== undefined &&
		product.version < latestExistingVersion
	) {
		return false;
	}
	const isFree = isFreeProduct({ prices: product.prices });
	const isCardlessTrial = product.free_trial?.card_required === false;
	return isFree || isCardlessTrial;
};
