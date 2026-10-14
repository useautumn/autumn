import {
	customerProductToEffectivePrices,
	type FullCusProduct,
	type FullProduct,
	isProductUpgrade,
	productToEffectivePrices,
} from "@autumn/shared";

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
