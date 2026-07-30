import { isOneOffProductV2, type ProductV2 } from "@autumn/shared";

export function getProductGroupKey({
	productId,
	products,
}: {
	productId: string;
	products: ProductV2[];
}): string {
	const product = products.find((p) => p.id === productId);
	if (!product || product.is_add_on || isOneOffProductV2(product)) {
		return productId;
	}

	return product.group ?? "";
}

export function getUsedProductGroupKeys({
	productIds,
	products,
}: {
	productIds: string[];
	products: ProductV2[];
}): Set<string> {
	return new Set(
		productIds
			.filter(Boolean)
			.map((productId) => getProductGroupKey({ productId, products })),
	);
}
