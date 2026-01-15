import {
	type Feature,
	type PriceTier,
	type ProductItem,
	UsageModel,
} from "@autumn/shared";
import type { SummaryItem } from "../types/summary";

function hasValue<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}

function formatPriceWithUnits(price: number, billingUnits: number): string {
	return billingUnits > 1
		? `$${price} per ${billingUnits}`
		: `$${price} per unit`;
}

function formatTierPricing({
	tiers,
	billingUnits,
}: {
	tiers: PriceTier[];
	billingUnits: number;
}): string {
	if (tiers.length === 0) return "Tiered";

	const firstPricedTier = tiers.find((tier) => tier.amount > 0);
	if (!firstPricedTier) {
		const lastTier = tiers[tiers.length - 1];
		if (lastTier.to === "inf") return "Unlimited free";
		return `${lastTier.to} free`;
	}

	return billingUnits > 1
		? `$${firstPricedTier.amount} per ${billingUnits}`
		: `$${firstPricedTier.amount} per unit`;
}

export function generateItemChanges({
	originalItems,
	customizedItems,
	features,
	prepaidOptions,
}: {
	originalItems: ProductItem[] | undefined;
	customizedItems: ProductItem[] | null;
	features?: Feature[];
	prepaidOptions?: Record<string, number>;
}): SummaryItem[] {
	if (!customizedItems || !originalItems) return [];

	const featureNameMap = new Map<string, string>();
	if (features) {
		for (const feature of features) {
			featureNameMap.set(feature.id, feature.name);
		}
	}

	const getFeatureName = (item: ProductItem): string => {
		if (item.feature?.name) return item.feature.name;
		if (item.feature_id && featureNameMap.has(item.feature_id)) {
			return featureNameMap.get(item.feature_id) as string;
		}
		return item.feature_id ?? "Item";
	};

	const changes: SummaryItem[] = [];

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

	for (const [featureId, original] of originalFeatureMap) {
		const customized = customizedFeatureMap.get(featureId);

		if (!customized) {
			changes.push({
				id: `item-removed-${featureId}`,
				type: "item",
				label: getFeatureName(original),
				oldValue: formatItemValue(original),
				newValue: null,
				productItem: original,
			});
		} else if (hasItemChanged(original, customized)) {
			const oldValueFormatted = formatChangedItemValue({
				item: original,
				original,
				customized,
			});
			const newValueFormatted = formatChangedItemValue({
				item: customized,
				original,
				customized,
			});
			changes.push({
				id: `item-modified-${featureId}`,
				type: "item",
				label: getFeatureName(original),
				oldValue: oldValueFormatted,
				newValue: newValueFormatted,
				productItem: customized,
			});
		}
	}

	for (const [featureId, customized] of customizedFeatureMap) {
		if (!originalFeatureMap.has(featureId)) {
			const prepaidQuantity =
				featureId && prepaidOptions ? prepaidOptions[featureId] : undefined;

			const isPrepaidWithQuantity =
				customized.usage_model === UsageModel.Prepaid &&
				hasValue(prepaidQuantity) &&
				prepaidQuantity > 0;

			const billingUnits = customized.billing_units ?? 1;
			const displayQuantity = prepaidQuantity
				? prepaidQuantity * billingUnits
				: 0;

			changes.push({
				id: `item-added-${featureId}`,
				type: "item",
				label: getFeatureName(customized),
				oldValue: isPrepaidWithQuantity ? 0 : null,
				newValue: isPrepaidWithQuantity
					? displayQuantity
					: formatItemValue(customized),
				productItem: customized,
			});
		}
	}

	const originalPriceItems = originalItems.filter((item) => !item.feature_id);
	const customizedPriceItems = customizedItems.filter(
		(item) => !item.feature_id,
	);

	if (originalPriceItems.length !== customizedPriceItems.length) {
		const priceDiff = customizedPriceItems.length - originalPriceItems.length;
		if (priceDiff > 0) {
			changes.push({
				id: "price-items-added",
				type: "item",
				label: `${priceDiff} Price Item${priceDiff > 1 ? "s" : ""}`,
				oldValue: null,
				newValue: String(priceDiff),
			});
		} else {
			changes.push({
				id: "price-items-removed",
				type: "item",
				label: `${Math.abs(priceDiff)} Price Item${Math.abs(priceDiff) > 1 ? "s" : ""}`,
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
	const parts: string[] = [];
	const includedUsage = item.included_usage;
	const hasIncludedUsage = hasValue(includedUsage);

	if (hasIncludedUsage) {
		if (includedUsage === "inf") {
			parts.push("Unlimited");
		} else {
			parts.push(`${includedUsage} Included`);
		}
	}

	const hasOveragePrice =
		hasValue(item.price) && item.price > 0 && hasIncludedUsage;
	const hasTieredPricing = item.tiers?.length && item.tiers.length > 0;

	if (hasOveragePrice) {
		const billingUnits = item.billing_units ?? 1;
		parts.push(formatPriceWithUnits(item.price ?? 0, billingUnits));
	} else if (hasTieredPricing && item.tiers) {
		const billingUnits = item.billing_units ?? 1;
		parts.push(formatTierPricing({ tiers: item.tiers, billingUnits }));
	} else if (!hasIncludedUsage && hasValue(item.price)) {
		return `$${item.price}`;
	}

	if (parts.length === 0) return "Configured";
	return parts.join(" + ");
}

/**
 * Format only the parts of an item that changed between original and customized.
 * Avoids showing unchanged values like "+ $10 per unit" when only included_usage changed.
 */
function formatChangedItemValue({
	item,
	original,
	customized,
}: {
	item: ProductItem;
	original: ProductItem;
	customized: ProductItem;
}): string {
	const parts: string[] = [];

	const includedUsageChanged =
		original.included_usage !== customized.included_usage;
	if (includedUsageChanged) {
		if (item.included_usage === "inf") {
			parts.push("Unlimited");
		} else if (hasValue(item.included_usage)) {
			parts.push(`${item.included_usage} Included`);
		}
	}

	const priceChanged = original.price !== customized.price;
	if (priceChanged && hasValue(item.price)) {
		const billingUnits = item.billing_units ?? 1;
		parts.push(formatPriceWithUnits(item.price, billingUnits));
	}

	const tiersChanged =
		JSON.stringify(original.tiers) !== JSON.stringify(customized.tiers);
	if (tiersChanged && item.tiers?.length) {
		const billingUnits = item.billing_units ?? 1;
		parts.push(formatTierPricing({ tiers: item.tiers, billingUnits }));
	}

	const billingUnitsChanged =
		original.billing_units !== customized.billing_units;
	if (billingUnitsChanged && !priceChanged && hasValue(item.price)) {
		const billingUnits = item.billing_units ?? 1;
		parts.push(formatPriceWithUnits(item.price, billingUnits));
	}

	const intervalChanged = original.interval !== customized.interval;
	if (intervalChanged && item.interval) {
		parts.push(`${item.interval}`);
	}

	if (parts.length === 0) return "Configured";
	return parts.join(" + ");
}
