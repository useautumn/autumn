import type { ProductItemInterval } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import type { ProductV2 } from "../../../models/productV2Models/productV2Models.js";
import { isPriceItem } from "../../productV2Utils/productItemUtils/getItemType.js";

export function productV2ToBasePrice({
	product,
}: {
	product: ProductV2;
}): { amount: number; interval: ProductItemInterval } | null {
	const item = product.items.find((x) => isPriceItem(x));

	if (item) {
		return {
			amount: item.price ?? 0,
			interval: (item.interval as unknown as ProductItemInterval) || null,
		};
	}

	return null;
}
