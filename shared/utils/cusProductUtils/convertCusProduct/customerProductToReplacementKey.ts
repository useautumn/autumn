import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import { isOneOffProduct } from "@utils/productUtils/classifyProduct/classifyProductUtils";
import { customerProductToEffectivePrices } from "./customerProductToEffectivePrices";

export const customerProductToReplacementKey = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}): string =>
	customerProduct.product.is_add_on ||
	isOneOffProduct({
		prices: customerProductToEffectivePrices({ customerProduct }),
	})
		? customerProduct.product.id
		: (customerProduct.product.group ?? "");
