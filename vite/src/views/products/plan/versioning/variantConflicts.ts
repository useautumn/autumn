import type { Feature, ProductItem } from "@autumn/shared";
import type { PlanVariant } from "@/services/products/ProductService";

const itemsByFeature = (items: ProductItem[]) => {
	const map = new Map<string, ProductItem[]>();
	for (const item of items) {
		if (!item.feature_id) continue;
		const list = map.get(item.feature_id) ?? [];
		list.push(item);
		map.set(item.feature_id, list);
	}
	return map;
};

const normalizeInterval = (item: ProductItem) => item.interval ?? "none";

const featureChanged = (
	baseList: ProductItem[] | undefined,
	editedList: ProductItem[],
) => {
	if (!baseList) return true;
	const strip = (list: ProductItem[]) =>
		JSON.stringify(
			[...list]
				.map((i) => ({
					interval: normalizeInterval(i),
					included: i.included_usage ?? null,
					price: i.price ?? null,
					tiers: i.tiers ?? null,
				}))
				.sort((a, b) => String(a.interval).localeCompare(String(b.interval))),
		);
	return strip(baseList) !== strip(editedList);
};

/**
 * Conflicting feature_ids for a variant: features the base edit changed where
 * the variant holds that feature at an interval the edit doesn't touch (e.g.
 * base messages/month edited, variant runs messages/year). Propagating would
 * insert a spurious item, so the owner should handle that variant separately.
 */
export function getVariantConflicts({
	baseItems,
	editedItems,
	variantItems,
}: {
	baseItems: ProductItem[];
	editedItems: ProductItem[];
	variantItems: ProductItem[];
}): string[] {
	const baseByFeature = itemsByFeature(baseItems);
	const editedByFeature = itemsByFeature(editedItems);
	const variantByFeature = itemsByFeature(variantItems);

	const conflicts: string[] = [];
	for (const [featureId, editedList] of editedByFeature) {
		if (!featureChanged(baseByFeature.get(featureId), editedList)) continue;

		const variantList = variantByFeature.get(featureId);
		if (!variantList || variantList.length === 0) continue; // clean add

		const variantIntervals = new Set(variantList.map(normalizeInterval));
		const editedIntervals = new Set(editedList.map(normalizeInterval));
		const sharesInterval = [...editedIntervals].some((iv) =>
			variantIntervals.has(iv),
		);
		if (!sharesInterval) conflicts.push(featureId);
	}
	return conflicts;
}

export interface VariantConflictInfo {
	variant: PlanVariant;
	conflictFeatureNames: string[];
}

export function getVariantConflictInfo({
	baseItems,
	editedItems,
	variants,
	features,
}: {
	baseItems: ProductItem[];
	editedItems: ProductItem[];
	variants: PlanVariant[];
	features: Feature[];
}): VariantConflictInfo[] {
	const featureName = (id: string) =>
		features.find((f) => f.id === id)?.name ?? id;

	return variants.map((variant) => ({
		variant,
		conflictFeatureNames: getVariantConflicts({
			baseItems,
			editedItems,
			variantItems: variant.items,
		}).map(featureName),
	}));
}
