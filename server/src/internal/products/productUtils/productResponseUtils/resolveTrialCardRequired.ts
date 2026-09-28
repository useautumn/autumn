import { type FullProduct, isFreeProduct } from "@autumn/shared";

/**
 * Free plans have no card gate (attach branches on price count), so a stored
 * `true` is inert and only misleads API consumers.
 */
export const resolveTrialCardRequired = ({
	product,
}: {
	product: FullProduct;
}): boolean => {
	if (isFreeProduct({ product })) return false;
	return product.free_trial?.card_required ?? false;
};
