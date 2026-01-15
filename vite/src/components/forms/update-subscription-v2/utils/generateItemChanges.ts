import type { ProductItem } from "@autumn/shared";
import type { SummaryItem } from "../types/summary";

export function generateItemChanges({
	originalItems,
	customizedItems,
}: {
	originalItems: ProductItem[] | undefined;
	customizedItems: ProductItem[] | null;
}): SummaryItem[] {
	if (!customizedItems || !originalItems) return [];

	const changes: SummaryItem[] = [];

	// Build maps by feature_id for comparison (for feature items)
	const originalFeatureMap = new Map(
		originalItems
			.filter((item) => item.feature_id)
			.map((item) => [item.feature_id, item]),
	);
	const customizedFeatureMap = new Map(
		customizedItems
			.filter((item) => item.feature_id)
			.map((item) => [item.feature_id, item]),
	);

	// Check for modifications and removals of feature items
	for (const [featureId, original] of originalFeatureMap) {
		const customized = customizedFeatureMap.get(featureId);

		if (!customized) {
			// Item removed
			changes.push({
				id: `item-removed-${featureId}`,
				type: "item",
				label: original.feature?.name ?? featureId ?? "Item",
				description: "removed",
				oldValue: formatItemValue(original),
				newValue: null,
				productItem: original,
			});
		} else if (hasItemChanged(original, customized)) {
			// Item modified
			changes.push({
				id: `item-modified-${featureId}`,
				type: "item",
				label: original.feature?.name ?? featureId ?? "Item",
				description: "modified",
				oldValue: formatItemValue(original),
				newValue: formatItemValue(customized),
				productItem: customized,
			});
		}
	}

	// Check for additions of feature items
	for (const [featureId, customized] of customizedFeatureMap) {
		if (!originalFeatureMap.has(featureId)) {
			changes.push({
				id: `item-added-${featureId}`,
				type: "item",
				label: customized.feature?.name ?? featureId ?? "Item",
				description: "added",
				oldValue: null,
				newValue: formatItemValue(customized),
				productItem: customized,
			});
		}
	}

	// Handle price-only items (no feature_id) by comparing counts
	const originalPriceItems = originalItems.filter((item) => !item.feature_id);
	const customizedPriceItems = customizedItems.filter(
		(item) => !item.feature_id,
	);

	// Simple comparison: if price item count changed, show as a single change
	if (originalPriceItems.length !== customizedPriceItems.length) {
		const priceDiff = customizedPriceItems.length - originalPriceItems.length;
		if (priceDiff > 0) {
			changes.push({
				id: "price-items-added",
				type: "item",
				label: `${priceDiff} price item${priceDiff > 1 ? "s" : ""}`,
				description: "added",
				oldValue: null,
				newValue: String(priceDiff),
			});
		} else {
			changes.push({
				id: "price-items-removed",
				type: "item",
				label: `${Math.abs(priceDiff)} price item${Math.abs(priceDiff) > 1 ? "s" : ""}`,
				description: "removed",
				oldValue: String(Math.abs(priceDiff)),
				newValue: null,
			});
		}
	}

	return changes;
}

function hasItemChanged(
	original: ProductItem,
	customized: ProductItem,
): boolean {
	return (
		original.price !== customized.price ||
		original.included_usage !== customized.included_usage ||
		JSON.stringify(original.tiers) !== JSON.stringify(customized.tiers) ||
		original.billing_units !== customized.billing_units ||
		original.interval !== customized.interval
	);
}

function formatItemValue(item: ProductItem): string {
	if (item.price !== null && item.price !== undefined) {
		return `$${item.price}`;
	}
	if (item.included_usage !== null && item.included_usage !== undefined) {
		if (item.included_usage === "inf") {
			return "unlimited";
		}
		return `${item.included_usage} included`;
	}
	if (item.tiers?.length) {
		return "tiered pricing";
	}
	return "configured";
}
