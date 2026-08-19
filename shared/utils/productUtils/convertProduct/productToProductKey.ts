import type { FullProduct } from "@models/productModels/productModels";
import type { ProductKey } from "@utils/productUtils/convertProduct/productKey";

export const productToProductKey = ({
	product,
}: {
	product: Pick<FullProduct, "id" | "version">;
}): ProductKey => ({
	planId: product.id,
	version: product.version,
});
