import { Infinite, isFeatureItem, type ProductItem } from "@autumn/shared";

const isUnlimitedItem = (item: ProductItem) => item.included_usage === Infinite;

const grantsFiniteAllowance = (item: ProductItem) =>
	!isUnlimitedItem(item) && isFeatureItem(item);

const itemToGrantScope = (item: ProductItem) =>
	item.feature_id ? `${item.feature_id}|${item.entity_feature_id ?? ""}` : "";

export const supersedeUnlimitedItems = ({
	items,
}: {
	items: ProductItem[];
}): ProductItem[] => {
	const finiteScopes = new Set(
		items.filter(grantsFiniteAllowance).map(itemToGrantScope).filter(Boolean),
	);

	if (finiteScopes.size === 0) return items;

	return items.filter(
		(item) =>
			!(isUnlimitedItem(item) && finiteScopes.has(itemToGrantScope(item))),
	);
};
