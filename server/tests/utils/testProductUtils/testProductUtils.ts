import type {
	BillingInterval,
	FixedPriceConfig,
	Price,
	ProductItem,
	ProductItemInterval,
	ProductV2,
} from "@autumn/shared";
import { isFixedPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
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
		product.id = `${prefix}_${product.id}`;
		product.name = `${prefix} ${product.name}`;
		product.group = prefix;
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
				item.interval === (interval as unknown as ProductItemInterval) &&
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
	const fixedPrice = prices.find((price) => isFixedPrice({ price }));
	if (fixedPrice) {
		return (fixedPrice.config as FixedPriceConfig).amount;
	} else return 0;
};
