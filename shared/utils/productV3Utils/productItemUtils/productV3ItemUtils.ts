import { ProductItemInterval } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import type { ProductV2 } from "../../../models/productV2Models/productV2Models.js";
import { isPriceItem } from "../../productDisplayUtils/getItemType.js";

export function productV2ToBasePrice({
	product,
}: {
	product: ProductV2;
}): { amount: number; interval: ProductItemInterval } | null {
	try {
		const item = product.items.find((x) => isPriceItem(x));

		if (item) {
			// Prefer price_config if available, otherwise use direct price
			if (
				item.price_config?.type === "fixed" &&
				item.price_config?.amount !== null
			) {
				return {
					amount: item.price_config.amount,
					interval: item.price_config.interval,
				};
			} else if (item.price !== null && item.price !== undefined) {
				return {
					amount: item.price,
					interval: ProductItemInterval.Month, // Default interval if not specified
				};
			}
		}
	} catch (error: unknown) {
		console.error("Error extracting price:", error);
		return null;
	}
	return null;
}
