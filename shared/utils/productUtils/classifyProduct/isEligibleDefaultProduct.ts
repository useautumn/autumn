import type { FullProduct } from "@models/productModels/productModels";
import { isFreeProduct } from "./classifyProductUtils.js";

/** Allowed to hold `is_default`: not a variant, not historical, free or cardless trial. */
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
