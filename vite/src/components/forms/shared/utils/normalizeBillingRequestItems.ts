import type { ProductItem } from "@autumn/shared";

type DraftProductItem = Omit<ProductItem, "price"> & {
	price?: ProductItem["price"] | "";
};

const isEmptyStandalonePriceDraft = (item: DraftProductItem) =>
	item.price === "" &&
	item.feature_id == null &&
	item.price_id == null &&
	item.entitlement_id == null &&
	item.price_config == null &&
	!item.tiers?.length;

export function normalizeBillingRequestItems({
	items,
}: {
	items?: ProductItem[] | null;
}): ProductItem[] | undefined {
	if (!items?.length) return undefined;

	const normalizedItems = (items as DraftProductItem[]).flatMap((item) => {
		if (isEmptyStandalonePriceDraft(item)) return [];
		if (item.price !== "") return [item as ProductItem];

		const { price: _price, ...itemWithoutDraftPrice } = item;
		return [itemWithoutDraftPrice as ProductItem];
	});

	return normalizedItems.length > 0 ? normalizedItems : undefined;
}
