import type { Feature } from "../../../models/featureModels/featureModels.js";
import type { PriceTier } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import {
	type ProductItem,
	UsageModel,
} from "../../../models/productV2Models/productItemModels/productItemModels.js";
import type { ItemEdit } from "./itemEditTypes.js";

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

/** Generates edit items for product item additions, removals, and modifications */
export function generateItemChanges({
	originalItems,
	updatedItems,
	features,
	prepaidOptions,
}: {
	originalItems: ProductItem[] | undefined;
	updatedItems: ProductItem[] | null;
	features?: Feature[];
	prepaidOptions?: Record<string, number>;
}): ItemEdit[] {
	if (!updatedItems || !originalItems) return [];

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

	const changes: ItemEdit[] = [];

	const originalFeatureMap = new Map(
		originalItems
			.filter((item) => item.feature_id)
			.map((item) => [item.feature_id, item]),
	);
	const updatedFeatureMap = new Map(
		updatedItems
			.filter((item) => item.feature_id)
			.map((item) => [item.feature_id, item]),
	);

	for (const [featureId, original] of originalFeatureMap) {
		const updated = updatedFeatureMap.get(featureId);

		if (!updated) {
			const oldFormatted = formatItemValue(original);
			changes.push({
				id: `item-removed-${featureId}`,
				type: "item",
				label: getFeatureName(original),
				icon: "item",
				description: `${getFeatureName(original)} removed (was ${oldFormatted})`,
				oldValue: oldFormatted,
				newValue: null,
				isUpgrade: false,
			});
		} else if (
			hasItemChanged({ originalItem: original, updatedItem: updated })
		) {
			const oldValueFormatted = formatChangedItemValue({
				item: original,
				originalItem: original,
				updatedItem: updated,
			});
			const newValueFormatted = formatChangedItemValue({
				item: updated,
				originalItem: original,
				updatedItem: updated,
			});
			changes.push({
				id: `item-modified-${featureId}`,
				type: "item",
				label: getFeatureName(original),
				icon: "item",
				description: `${getFeatureName(original)} changed from ${oldValueFormatted} to ${newValueFormatted}`,
				oldValue: oldValueFormatted,
				newValue: newValueFormatted,
				isUpgrade: true,
			});
		}
	}

	for (const [featureId, updated] of updatedFeatureMap) {
		if (!originalFeatureMap.has(featureId)) {
			const prepaidQuantity =
				featureId && prepaidOptions ? prepaidOptions[featureId] : undefined;

			const isPrepaidWithQuantity =
				updated.usage_model === UsageModel.Prepaid &&
				hasValue(prepaidQuantity) &&
				prepaidQuantity > 0;

			const billingUnits = updated.billing_units ?? 1;
			const displayQuantity = prepaidQuantity
				? prepaidQuantity * billingUnits
				: 0;

			const newValue = isPrepaidWithQuantity
				? displayQuantity
				: formatItemValue(updated);

			changes.push({
				id: `item-added-${featureId}`,
				type: "item",
				label: getFeatureName(updated),
				icon: "item",
				description: `${getFeatureName(updated)} added (${newValue})`,
				oldValue: isPrepaidWithQuantity ? 0 : null,
				newValue,
				isUpgrade: true,
			});
		}
	}

	const originalPriceItems = originalItems.filter((item) => !item.feature_id);
	const updatedPriceItems = updatedItems.filter((item) => !item.feature_id);

	if (originalPriceItems.length !== updatedPriceItems.length) {
		const priceDiff = updatedPriceItems.length - originalPriceItems.length;
		if (priceDiff > 0) {
			const label = `${priceDiff} Price Item${priceDiff > 1 ? "s" : ""}`;
			changes.push({
				id: "price-items-added",
				type: "item",
				label,
				icon: "price",
				description: `${label} added`,
				oldValue: null,
				newValue: String(priceDiff),
				isUpgrade: true,
			});
		} else {
			const label = `${Math.abs(priceDiff)} Price Item${Math.abs(priceDiff) > 1 ? "s" : ""}`;
			changes.push({
				id: "price-items-removed",
				type: "item",
				label,
				icon: "price",
				description: `${label} removed`,
				oldValue: String(Math.abs(priceDiff)),
				newValue: null,
				isUpgrade: false,
			});
		}
	}

	return changes;
}

function hasItemChanged({
	originalItem,
	updatedItem,
}: {
	originalItem: ProductItem;
	updatedItem: ProductItem;
}): boolean {
	return (
		originalItem.price !== updatedItem.price ||
		originalItem.included_usage !== updatedItem.included_usage ||
		JSON.stringify(originalItem.tiers) !== JSON.stringify(updatedItem.tiers) ||
		originalItem.billing_units !== updatedItem.billing_units ||
		originalItem.interval !== updatedItem.interval
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

	if (parts.length === 0) return "Enabled";
	return parts.join(" + ");
}

function formatChangedItemValue({
	item,
	originalItem,
	updatedItem,
}: {
	item: ProductItem;
	originalItem: ProductItem;
	updatedItem: ProductItem;
}): string {
	const parts: string[] = [];

	const includedUsageChanged =
		originalItem.included_usage !== updatedItem.included_usage;
	if (includedUsageChanged) {
		if (item.included_usage === "inf") {
			parts.push("Unlimited");
		} else if (hasValue(item.included_usage)) {
			parts.push(`${item.included_usage} Included`);
		}
	}

	const priceChanged = originalItem.price !== updatedItem.price;
	if (priceChanged && hasValue(item.price)) {
		const billingUnits = item.billing_units ?? 1;
		parts.push(formatPriceWithUnits(item.price, billingUnits));
	}

	const tiersChanged =
		JSON.stringify(originalItem.tiers) !== JSON.stringify(updatedItem.tiers);
	if (tiersChanged && item.tiers?.length) {
		const billingUnits = item.billing_units ?? 1;
		parts.push(formatTierPricing({ tiers: item.tiers, billingUnits }));
	}

	const billingUnitsChanged =
		originalItem.billing_units !== updatedItem.billing_units;
	if (billingUnitsChanged && !priceChanged && hasValue(item.price)) {
		const billingUnits = item.billing_units ?? 1;
		parts.push(formatPriceWithUnits(item.price, billingUnits));
	}

	const intervalChanged = originalItem.interval !== updatedItem.interval;
	if (intervalChanged && item.interval) {
		parts.push(`${item.interval}`);
	}

	if (parts.length === 0) return "Enabled";
	return parts.join(" + ");
}
