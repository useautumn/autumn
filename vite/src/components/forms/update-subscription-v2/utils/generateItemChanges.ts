import {
	type Feature,
	type PriceTier,
	type ProductItem,
	UsageModel,
} from "@autumn/shared";
import type { SummaryItem } from "../types/summary";

function formatTierPricing({
	tiers,
	billingUnits,
}: {
	tiers: PriceTier[];
	billingUnits: number;
}): string {
	if (tiers.length === 0) return "Tiered";

	// Find the first tier with a price to show
	const firstPricedTier = tiers.find((tier) => tier.amount > 0);
	if (!firstPricedTier) {
		// All tiers are free
		const lastTier = tiers[tiers.length - 1];
		if (lastTier.to === "inf") return "Unlimited free";
		return `${lastTier.to} free`;
	}

	// Format: "$20 per 100" style
	if (billingUnits > 1) {
		return `$${firstPricedTier.amount} per ${billingUnits}`;
	}
	return `$${firstPricedTier.amount} per unit`;
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

	// Build a map of feature_id to feature name for lookups
	const featureNameMap = new Map<string, string>();
	if (features) {
		for (const feature of features) {
			featureNameMap.set(feature.id, feature.name);
		}
	}

	// Helper to get feature name from item or features list
	const getFeatureName = (item: ProductItem): string => {
		if (item.feature?.name) return item.feature.name;
		if (item.feature_id && featureNameMap.has(item.feature_id)) {
			return featureNameMap.get(item.feature_id) as string;
		}
		return item.feature_id ?? "Item";
	};

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
				label: getFeatureName(original),
				description: "Removed from plan",
				oldValue: formatItemValue(original),
				newValue: null,
				productItem: original,
			});
		} else if (hasItemChanged(original, customized)) {
			// Item modified
			changes.push({
				id: `item-modified-${featureId}`,
				type: "item",
				label: getFeatureName(original),
				description: getModificationDescription({ original, customized }),
				oldValue: formatItemValue(original),
				newValue: formatItemValue(customized),
				productItem: customized,
			});
		}
	}

	// Check for additions of feature items
	for (const [featureId, customized] of customizedFeatureMap) {
		if (!originalFeatureMap.has(featureId)) {
			// Get prepaid quantity if this is a prepaid item
			const prepaidQuantity =
				featureId && prepaidOptions ? prepaidOptions[featureId] : undefined;

			// For prepaid items with quantity, show 0 → X in the badge
			const isPrepaidWithQuantity =
				customized.usage_model === UsageModel.Prepaid &&
				prepaidQuantity !== undefined &&
				prepaidQuantity > 0;

			const billingUnits = customized.billing_units ?? 1;
			const displayQuantity = prepaidQuantity
				? prepaidQuantity * billingUnits
				: 0;

			changes.push({
				id: `item-added-${featureId}`,
				type: "item",
				label: getFeatureName(customized),
				description: getAdditionDescription({
					item: customized,
					prepaidQuantity,
				}),
				oldValue: isPrepaidWithQuantity ? 0 : null,
				newValue: isPrepaidWithQuantity
					? displayQuantity
					: formatItemValue(customized),
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
				label: `${priceDiff} Price Item${priceDiff > 1 ? "s" : ""}`,
				description: "Added to plan",
				oldValue: null,
				newValue: String(priceDiff),
			});
		} else {
			changes.push({
				id: "price-items-removed",
				type: "item",
				label: `${Math.abs(priceDiff)} Price Item${Math.abs(priceDiff) > 1 ? "s" : ""}`,
				description: "Removed from plan",
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

function getModificationDescription({
	original,
	customized,
}: {
	original: ProductItem;
	customized: ProductItem;
}): string {
	// Priority: included_usage changes are most common
	if (original.included_usage !== customized.included_usage) {
		const oldValue = original.included_usage;
		const newValue = customized.included_usage;

		if (newValue === "inf") return "Changed to unlimited";
		if (oldValue === "inf") return `Limited to ${newValue}`;

		const oldNum = Number(oldValue);
		const newNum = Number(newValue);
		if (newNum < oldNum) return `Reduced from ${oldValue} to ${newValue}`;
		return `Increased from ${oldValue} to ${newValue}`;
	}

	if (original.price !== customized.price) {
		const oldPrice = original.price ?? 0;
		const newPrice = customized.price ?? 0;
		if (newPrice > oldPrice) return `Price increased to $${newPrice}`;
		return `Price reduced to $${newPrice}`;
	}

	if (JSON.stringify(original.tiers) !== JSON.stringify(customized.tiers)) {
		return "Pricing tiers updated";
	}

	if (original.interval !== customized.interval) {
		return `Billing cycle changed to ${customized.interval}`;
	}

	return "Configuration updated";
}

function getAdditionDescription({
	item,
	prepaidQuantity,
}: {
	item: ProductItem;
	prepaidQuantity?: number;
}): string {
	// For prepaid items with a quantity set, show the prepaid info
	if (
		item.usage_model === UsageModel.Prepaid &&
		prepaidQuantity !== undefined &&
		prepaidQuantity > 0
	) {
		const billingUnits = item.billing_units ?? 1;
		const displayQuantity = prepaidQuantity * billingUnits;
		return `Added with ${displayQuantity} prepaid`;
	}

	const parts: string[] = [];

	// Check for included usage
	const hasIncludedUsage =
		item.included_usage !== null && item.included_usage !== undefined;
	if (hasIncludedUsage) {
		if (item.included_usage === "inf") {
			parts.push("unlimited");
		} else {
			parts.push(`${item.included_usage} included`);
		}
	}

	// Check for overage pricing (price or tiers)
	const hasOveragePrice =
		item.price !== null &&
		item.price !== undefined &&
		item.price > 0 &&
		hasIncludedUsage;
	const hasTieredPricing = item.tiers?.length && item.tiers.length > 0;

	if (hasOveragePrice) {
		const billingUnits = item.billing_units ?? 1;
		if (billingUnits > 1) {
			parts.push(`then $${item.price} per ${billingUnits}`);
		} else {
			parts.push(`then $${item.price} per unit`);
		}
	} else if (hasTieredPricing && item.tiers) {
		const billingUnits = item.billing_units ?? 1;
		const tierText = formatTierPricing({ tiers: item.tiers, billingUnits });
		parts.push(`then ${tierText}`);
	} else if (
		!hasIncludedUsage &&
		item.price !== null &&
		item.price !== undefined
	) {
		// Pure price item (no included usage)
		return `Added at $${item.price}`;
	}

	if (parts.length === 0) return "Added to plan";
	return `Added with ${parts.join(", ")}`;
}

function formatItemValue(item: ProductItem): string {
	const parts: string[] = [];

	// Check for included usage
	const hasIncludedUsage =
		item.included_usage !== null && item.included_usage !== undefined;
	if (hasIncludedUsage) {
		if (item.included_usage === "inf") {
			parts.push("Unlimited");
		} else {
			parts.push(`${item.included_usage} Included`);
		}
	}

	// Check for overage pricing
	const hasOveragePrice =
		item.price !== null &&
		item.price !== undefined &&
		item.price > 0 &&
		hasIncludedUsage;
	const hasTieredPricing = item.tiers?.length && item.tiers.length > 0;

	if (hasOveragePrice) {
		const billingUnits = item.billing_units ?? 1;
		if (billingUnits > 1) {
			parts.push(`$${item.price} per ${billingUnits}`);
		} else {
			parts.push(`$${item.price} per unit`);
		}
	} else if (hasTieredPricing && item.tiers) {
		const billingUnits = item.billing_units ?? 1;
		parts.push(formatTierPricing({ tiers: item.tiers, billingUnits }));
	} else if (
		!hasIncludedUsage &&
		item.price !== null &&
		item.price !== undefined
	) {
		// Pure price item
		return `$${item.price}`;
	}

	if (parts.length === 0) return "Configured";
	return parts.join(" + ");
}
