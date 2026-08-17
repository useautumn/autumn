import type { FullProduct } from "@models/productModels/productModels";
import { isOneOffProduct } from "@utils/productUtils/classifyProduct/classifyProductUtils";

/**
 * The slot a plan occupies within one scope. Add-ons and one-offs stack rather
 * than replace, so they key on their own id instead of their group.
 */
export const productToReplacementKey = ({
	product,
}: {
	product: FullProduct;
}): string =>
	product.is_add_on || isOneOffProduct({ product })
		? product.id
		: (product.group ?? "");
