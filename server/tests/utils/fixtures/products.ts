import type { ProductItem, ProductV2 } from "@autumn/shared";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";

/**
 * Base product - no base price, customizable defaults
 * @param items - Product items (features)
 * @param id - Product ID (default: "base")
 * @param isDefault - Whether this is a default product (default: false)
 */
const base = ({
	items,
	id = "base",
	isDefault = false,
}: {
	items: ProductItem[];
	id?: string;
	isDefault?: boolean;
}): ProductV2 => ({
	...constructRawProduct({ id, items }),
	is_default: isDefault,
});

export const products = {
	base,
} as const;
