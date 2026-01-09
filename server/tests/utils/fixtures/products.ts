import type { ProductItem, ProductV2 } from "@autumn/shared";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";

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
	isAddOn = false,
}: {
	items: ProductItem[];
	id?: string;
	isDefault?: boolean;
	isAddOn?: boolean;
}): ProductV2 => ({
	...constructRawProduct({ id, items, isAddOn }),
	is_default: isDefault,
});

/**
 * Pro product - $20/month base price
 * @param items - Product items (features)
 * @param id - Product ID (default: "pro")
 */
const pro = ({
	items,
	id = "pro",
}: {
	items: ProductItem[];
	id?: string;
}): ProductV2 =>
	constructProduct({
		id,
		items: [...items],
		type: "pro",
		isDefault: false,
	});

/**
 * Pro annual product - $200/year base price
 * @param items - Product items (features)
 * @param id - Product ID (default: "pro-annual")
 */
const proAnnual = ({
	items,
	id = "pro-annual",
}: {
	items: ProductItem[];
	id?: string;
}): ProductV2 =>
	constructProduct({
		id,
		items: [...items],
		type: "pro",
		isAnnual: true,
		isDefault: false,
	});

export const products = {
	base,
	pro,
	proAnnual,
} as const;
