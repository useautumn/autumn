import type { ProductItem } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { UsageModel } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { notNullish } from "../../utils.js";
import { isBooleanFeatureItem, isFeaturePriceItem } from "./getItemType.js";

const BOOLEAN_COLLAPSE_THRESHOLD = 5;

function getItemPriority(item: ProductItem): number {
	if (isFeaturePriceItem(item)) {
		return item.usage_model === UsageModel.Prepaid ? 0 : 1;
	}
	if (isBooleanFeatureItem(item)) return 3;
	return 2;
}

function compareItems(a: ProductItem, b: ProductItem): number {
	const priorityA = getItemPriority(a);
	const priorityB = getItemPriority(b);
	if (priorityA !== priorityB) return priorityA - priorityB;

	const featureA = a.feature_id ?? "";
	const featureB = b.feature_id ?? "";
	return featureA.localeCompare(featureB);
}

export function sortPlanItems({
	items,
}: {
	items: ProductItem[];
}): ProductItem[] {
	const nonEntity: ProductItem[] = [];
	const entityGroups = new Map<string, ProductItem[]>();

	for (const item of items) {
		if (notNullish(item.entity_feature_id)) {
			const group = entityGroups.get(item.entity_feature_id) ?? [];
			group.push(item);
			entityGroups.set(item.entity_feature_id, group);
		} else {
			nonEntity.push(item);
		}
	}

	nonEntity.sort(compareItems);

	const sortedEntityKeys = [...entityGroups.keys()].sort((a, b) =>
		a.localeCompare(b),
	);

	const sortedEntityItems: ProductItem[] = [];
	for (const key of sortedEntityKeys) {
		const group = entityGroups.get(key);
		if (!group) continue;
		group.sort(compareItems);
		sortedEntityItems.push(...group);
	}

	return [...nonEntity, ...sortedEntityItems];
}

export function splitBooleanItems({ items }: { items: ProductItem[] }): {
	visibleItems: ProductItem[];
	collapsedBooleanItems: ProductItem[];
} {
	let booleanCount = 0;
	const visibleItems: ProductItem[] = [];
	const collapsedBooleanItems: ProductItem[] = [];

	for (const item of items) {
		if (isBooleanFeatureItem(item)) {
			booleanCount++;
			if (booleanCount <= BOOLEAN_COLLAPSE_THRESHOLD) {
				visibleItems.push(item);
			} else {
				collapsedBooleanItems.push(item);
			}
		} else {
			visibleItems.push(item);
		}
	}

	return { visibleItems, collapsedBooleanItems };
}
