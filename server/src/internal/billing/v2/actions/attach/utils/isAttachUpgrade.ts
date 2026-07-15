import {
	customerProductToEffectivePrices,
	type FullCusProduct,
	type FullProduct,
	isProductUpgrade,
	productToEffectivePrices,
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

	const currentPrices = customerProductToEffectivePrices({
		customerProduct: currentCustomerProduct,
	});

	return isProductUpgrade({
		prices1: currentPrices,
		prices2: productToEffectivePrices({ product: attachProduct }),
	});
};
