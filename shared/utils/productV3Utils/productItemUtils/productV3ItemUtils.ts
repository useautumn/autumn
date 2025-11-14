import type { PriceItem } from "../../../models/productV2Models/productItemModels/priceItem.js";
import type { ProductItem } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import type { ProductV2 } from "../../../models/productV2Models/productV2Models.js";
import {
	isFeatureItem,
	isFeaturePriceItem,
	isPriceItem,
} from "../../productV2Utils/productItemUtils/getItemType.js";

export function productV2ToBasePrice({
	product,
}: {
	product: ProductV2;
}): PriceItem {
	const item = product.items.find((x) => isPriceItem(x));

	return item as PriceItem;
}

export const productV2ToFeatureItems = ({
	items,
	withBasePrice = false,
}: {
	items: ProductItem[];
	withBasePrice?: boolean;
}) => {
	const filteredItems = items.filter(
		(item) => isFeatureItem(item) || isFeaturePriceItem(item),
	);

	const priceItem = items.find((item) => isPriceItem(item));
	if (withBasePrice && priceItem) {
		return [...filteredItems, priceItem];
	}

	return filteredItems;
};
