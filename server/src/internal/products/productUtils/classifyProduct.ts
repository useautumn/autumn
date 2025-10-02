import type {
	CreateProductParams,
	FullProduct,
	Price,
	ProductV2,
} from "@autumn/shared";
import { pricesOnlyOneOff } from "../prices/priceUtils.js";
import { isFeatureItem } from "../product-items/productItemUtils/getItemType.js";
import { isFreeProduct } from "../productUtils.js";

export const prodIsAddOn = ({ product }: { product: FullProduct }) => {
	return product.is_add_on;
};

export const oneOffOrAddOn = ({
	product,
	prices,
}: {
	product: FullProduct;
	prices?: Price[];
}) => {
	const isOneOff = prices
		? pricesOnlyOneOff(prices)
		: pricesOnlyOneOff(product.prices);

	return prodIsAddOn({ product }) || isOneOff;
};

export const isMainProduct = ({
	product,
	prices,
}: {
	product: FullProduct;
	prices?: Price[];
}) => {
	return !prodIsAddOn({ product }) && !oneOffOrAddOn({ product, prices });
};

export const isFreeProductV2 = ({
	product,
}: {
	product: ProductV2 | CreateProductParams;
}) => {
	return (product.items || []).every((item) => isFeatureItem(item));
};

export const isDefaultTrial = ({
	product,
	skipDefault = false,
}: {
	product: ProductV2 | CreateProductParams;
	skipDefault?: boolean;
}) => {
	return (
		product.free_trial &&
		!product.free_trial?.card_required &&
		(product.is_default || skipDefault) &&
		!isFreeProductV2({ product })
	);
};

export const isDefaultTrialFullProduct = ({
	product,
	skipDefault = false,
}: {
	product: FullProduct;
	skipDefault?: boolean;
}) => {
	// If it's free + trial, also consider it default trial
	if (isFreeProduct(product.prices) && product.free_trial) return true;

	return (
		product.free_trial &&
		!product.free_trial?.card_required &&
		(product.is_default || skipDefault) &&
		!isFreeProduct(product.prices)
	);
};
