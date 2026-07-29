import type { Price } from "@models/productModels/priceModels/priceModels";
import type { FullProduct } from "@models/productModels/productModels";

export const productToEffectivePrices = ({
	product,
}: {
	product: FullProduct;
}): Price[] => [
	...product.prices,
	...(product.licenses ?? []).flatMap((license) => license.product.prices),
];
