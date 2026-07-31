import type { ProductItem } from "@autumn/shared";
import { isFeaturePriceItem, isPriceItem } from "@/utils/product/getItemType";

const hasIncludedUsage = (item: ProductItem) =>
	item.included_usage != null && item.included_usage !== 0;

export function stripPricesFromItems({
	items,
}: {
	items: ProductItem[];
}): ProductItem[] {
	return items.flatMap((item) => {
		if (
			isPriceItem(item) ||
			(isFeaturePriceItem(item) && !hasIncludedUsage(item))
		) {
			return [];
		}
		return [
			isFeaturePriceItem(item)
				? {
						...item,
						price: null,
						tiers: null,
						usage_model: null,
						price_config: null,
					}
				: item,
		];
	});
}

export function getAttachDisplayItems({
	items,
	productItems,
	grantFree,
}: {
	items: ProductItem[] | null;
	productItems?: ProductItem[];
	grantFree: boolean;
}) {
	return grantFree
		? stripPricesFromItems({ items: items ?? productItems ?? [] })
		: items;
}
