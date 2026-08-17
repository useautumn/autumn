import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import { isOneOffProduct } from "@utils/productUtils/classifyProduct/classifyProductUtils";
import { customerProductToEffectivePrices } from "./customerProductToEffectivePrices";

/**
 * The slot a customer product occupies: its group, or its own id for add-ons
 * and one-offs (they stack rather than replace). Mirrors productToReplacementKey.
 */
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
