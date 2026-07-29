import {
	BillingInterval,
	type CreateProductV2Params,
	type FullProduct,
	isFreeProduct,
	isOneOffProduct,
	type ProductItem,
	type ProductV2,
} from "@autumn/shared";
import { isFeatureItem } from "../product-items/productItemUtils/getItemType.js";

const prodIsAddOn = ({ product }: { product: FullProduct }) => {
	return product.is_add_on;
};

export const oneOffOrAddOn = ({ product }: { product: FullProduct }) => {
	return prodIsAddOn({ product }) || isOneOffProduct({ product });
};

export const isMainProduct = ({ product }: { product: FullProduct }) => {
	return !prodIsAddOn({ product }) && !oneOffOrAddOn({ product });
};

export const isFreeProductV2 = ({
	product,
}: {
	product: ProductV2 | CreateProductV2Params;
}) => {
	return (product.items || []).every((item: ProductItem) =>
		isFeatureItem(item),
	);
};

const isDefaultTrial = ({
	product,
	skipDefault = false,
}: {
	product: ProductV2 | CreateProductV2Params;
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
	if (isFreeProduct({ product }) && product.free_trial) return true;

	return (
		product.free_trial &&
		!product.free_trial?.card_required &&
		(product.is_default || skipDefault) &&
		!isFreeProduct({ product })
	);
};
