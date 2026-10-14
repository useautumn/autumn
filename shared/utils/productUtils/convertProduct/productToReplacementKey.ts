import type { FullProduct } from "@models/productModels/productModels";
import { isOneOffProduct } from "@utils/productUtils/classifyProduct/classifyProductUtils";

export const productToReplacementKey = ({
	product,
}: {
	product: FullProduct;
}): string =>
	product.is_add_on || isOneOffProduct({ product })
		? product.id
		: (product.group ?? "");
