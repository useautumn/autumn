import {
	type BillingInterval,
	type FixedPriceConfig,
	isFixedPrice,
	itemToBillingInterval,
	type Price,
	type ProductItem,
	type ProductV2,
} from "@autumn/shared";
import { isPriceItem } from "@/internal/products/product-items/productItemUtils/getItemType.js";
import { nullish } from "@/utils/genUtils.js";

export const addPrefixToProducts = ({
	products,
	prefix,
}: {
	products: ProductV2[];
	prefix: string;
}) => {
	for (const product of products) {
		product.id = `${product.id}_${prefix}`;
		product.name = `${product.name} ${prefix}`;
		// Only set group to prefix if not explicitly defined (null/undefined)
		// Preserve empty string "" as an explicit "no group" value
		if (product.group === null || product.group === undefined) {
			product.group = prefix;
		}
	}

	return products;
};

export const replaceItems = ({
	featureId,
	interval,
	intervalCount,
	newItem,
	items,
}: {
	featureId?: string;
	interval?: BillingInterval;
	intervalCount?: number;
	newItem: ProductItem;
	items: ProductItem[];
}) => {
	const newItems = structuredClone(items);

	let index: number | undefined;
	if (featureId) {
		index = newItems.findIndex((item) => item.feature_id === featureId);
	}

	if (interval) {
		index = newItems.findIndex(
			(item) =>
				itemToBillingInterval({ item }) === interval &&
				(intervalCount ? item.interval_count === intervalCount : true) &&
				nullish(item.feature_id),
		);
	}

	if (index === -1) {
		throw new Error("Item not found");
	}

	newItems[index!] = newItem;

	return newItems;
};

export const getBasePrice = ({ product }: { product: ProductV2 }) => {
	return product.items.find((item) => isPriceItem(item))?.price || 0;
};

export const v1ProductToBasePrice = ({ prices }: { prices: Price[] }) => {
	const fixedPrice = prices.find((price) => isFixedPrice(price));
	if (fixedPrice) {
		return (fixedPrice.config as FixedPriceConfig).amount;
	} else return 0;
};
