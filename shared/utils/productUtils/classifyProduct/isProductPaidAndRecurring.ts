import type { FullProduct } from "@models/productModels/productModels";
import {
	isFreeProduct,
	isOneOffProduct,
} from "@utils/productUtils/classifyProduct/classifyProductUtils";

export const isProductPaidAndRecurring = (product: FullProduct) => {
	return (
		!isOneOffProduct({ prices: product.prices }) &&
		!isFreeProduct({ prices: product.prices })
	);
};
