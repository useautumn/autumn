import type { ProductItem, ProductV2 } from "@autumn/shared";

export function getSelectedPlanPriceProduct({
	product,
	customItems,
}: {
	product: ProductV2;
	customItems?: ProductItem[] | null;
}): ProductV2 {
	return { ...product, items: customItems ?? product.items };
}
