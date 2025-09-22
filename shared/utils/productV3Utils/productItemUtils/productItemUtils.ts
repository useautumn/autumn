import { ProductItemInterval } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import type { ProductV2 } from "../../../models/productV2Models/productV2Models.js";

export function extractTopLevelPrice(
	product: ProductV2,
): { amount: number; interval: ProductItemInterval } | null {
	try {
		// First try to find an item with price_config
		let item = product.items.find(
			(x) =>
				x.price_config?.type === "fixed" && x.price_config?.amount !== null,
		);

		// If no price_config, try to find an item with direct price
		if (!item) {
			item = product.items.find(
				(x) => x.price !== null && x.price !== undefined,
			);
		}
        
		if(item) {
			// Prefer price_config if available, otherwise use direct price
			if (item.price_config?.type === "fixed" && item.price_config?.amount !== null) {
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
