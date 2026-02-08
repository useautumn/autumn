import {
	cusProductToPrices,
	type FullCusProduct,
	type FullProduct,
	isProductUpgrade,
} from "@autumn/shared";

/**
 * Determines if attaching a product is an upgrade from the current product.
 * An upgrade occurs when the new product has a higher price or longer billing interval.
 */
export const isAttachUpgrade = ({
	currentCustomerProduct,
	attachProduct,
}: {
	currentCustomerProduct?: FullCusProduct;
	attachProduct: FullProduct;
}): boolean => {
	if (!currentCustomerProduct) {
		return false;
	}

	const currentPrices = cusProductToPrices({
		cusProduct: currentCustomerProduct,
	});

	return isProductUpgrade({
		prices1: currentPrices,
		prices2: attachProduct.prices,
	});
};
