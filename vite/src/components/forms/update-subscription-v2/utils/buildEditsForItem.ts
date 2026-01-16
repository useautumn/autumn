import { type ProductItem, UsageModel } from "@autumn/shared";
import type { ItemEdit } from "../types/summary";

/** Format tier threshold value for display */
function formatTierValue(value: string | number | "inf"): string {
	return value === "inf" ? "Infinite" : String(value);
}

export function buildEditsForItem({
	item,
	originalItem,
	prepaidQuantity,
	initialPrepaidQuantity,
}: {
	item: ProductItem;
	originalItem?: ProductItem;
	prepaidQuantity?: number;
	initialPrepaidQuantity?: number;
}): ItemEdit[] {
	const edits: ItemEdit[] = [];
	const isPrepaid = item.usage_model === UsageModel.Prepaid;

	if (originalItem) {
		if (
			originalItem.price !== item.price &&
			originalItem.price !== null &&
			originalItem.price !== undefined &&
			item.price !== null &&
			item.price !== undefined
		) {
			const oldPrice = originalItem.price;
			const newPrice = item.price;
			const isUpgrade = newPrice < oldPrice;
			edits.push({
				id: `price-${item.feature_id}`,
				type: "config",
				icon: "price",
				label: "Price",
				description: isUpgrade
					? `Price decreased from $${oldPrice} to $${newPrice}`
					: `Price increased from $${oldPrice} to $${newPrice}`,
				oldValue: `$${oldPrice}`,
				newValue: `$${newPrice}`,
				isUpgrade,
			});
		}

		const oldTiers = originalItem.tiers ?? [];
		const newTiers = item.tiers ?? [];

		for (let i = 0; i < newTiers.length; i++) {
			const newTier = newTiers[i];
			const oldTier = oldTiers[i];
			const tierLabel = `${formatTierValue(newTier.to)} units`;

			if (!oldTier) {
				const prevTierTo = i === 0 ? "0" : (oldTiers[i - 1]?.to ?? "0");
				const prevLabel = formatTierValue(prevTierTo);
				edits.push({
					id: `tier-${item.feature_id}-${i}`,
					type: "config",
					icon: "tier",
					label: "Pricing Tier",
					description: `Added tier: after ${prevLabel} units costs $${newTier.amount}`,
					oldValue: null,
					newValue: `$${newTier.amount}`,
					isUpgrade: true,
				});
			} else if (oldTier.amount !== newTier.amount) {
				const isUpgrade = newTier.amount < oldTier.amount;
				edits.push({
					id: `tier-${item.feature_id}-${i}`,
					type: "config",
					icon: "tier",
					label: "Pricing Tier",
					description: isUpgrade
						? `Tier price decreased from $${oldTier.amount} to $${newTier.amount} (up to ${tierLabel})`
						: `Tier price increased from $${oldTier.amount} to $${newTier.amount} (up to ${tierLabel})`,
					oldValue: `$${oldTier.amount}`,
					newValue: `$${newTier.amount}`,
					isUpgrade,
				});
			} else if (oldTier.to !== newTier.to) {
				const oldLabel = formatTierValue(oldTier.to);
				const newLabel = formatTierValue(newTier.to);
				const isUpgrade =
					newTier.to === "inf" ||
					(oldTier.to !== "inf" && Number(newTier.to) > Number(oldTier.to));
				edits.push({
					id: `tier-${item.feature_id}-${i}-threshold`,
					type: "config",
					icon: "tier",
					label: "Pricing Tier",
					description: isUpgrade
						? `Tier threshold increased from ${oldLabel} to ${newLabel} units`
						: `Tier threshold decreased from ${oldLabel} to ${newLabel} units`,
					oldValue: oldLabel,
					newValue: newLabel,
					isUpgrade,
				});
			}
		}

		for (let i = newTiers.length; i < oldTiers.length; i++) {
			const oldTier = oldTiers[i];
			const tierLabel = formatTierValue(oldTier.to);
			edits.push({
				id: `tier-${item.feature_id}-${i}-removed`,
				type: "config",
				icon: "tier",
				label: "Pricing Tier",
				description: `Removed tier: up to ${tierLabel} units at $${oldTier.amount}`,
				oldValue: `$${oldTier.amount}`,
				newValue: null,
				isUpgrade: true,
			});
		}

		const oldUsage = originalItem.included_usage ?? 0;
		const newUsage = item.included_usage ?? 0;
		if (oldUsage !== newUsage) {
			const formatUsageValue = (val: string | number) =>
				val === "inf" ? "unlimited" : String(val);
			const formatUsageDisplay = (val: string | number) =>
				val === "inf" ? "Unlimited" : `${val} Included`;
			const oldNum =
				oldUsage === "inf" ? Number.POSITIVE_INFINITY : Number(oldUsage);
			const newNum =
				newUsage === "inf" ? Number.POSITIVE_INFINITY : Number(newUsage);
			const isUpgrade = newNum > oldNum;
			edits.push({
				id: `usage-${item.feature_id}`,
				type: "config",
				icon: "usage",
				label: "Included Usage",
				description: isUpgrade
					? `Included usage increased from ${formatUsageValue(oldUsage)} to ${formatUsageValue(newUsage)}`
					: `Included usage decreased from ${formatUsageValue(oldUsage)} to ${formatUsageValue(newUsage)}`,
				oldValue: formatUsageDisplay(oldUsage),
				newValue: formatUsageDisplay(newUsage),
				isUpgrade,
			});
		}

		const oldUnits = originalItem.billing_units ?? 1;
		const newUnits = item.billing_units ?? 1;
		if (oldUnits !== newUnits) {
			const isUpgrade = newUnits > oldUnits;
			edits.push({
				id: `units-${item.feature_id}`,
				type: "config",
				icon: "units",
				label: "Billing Units",
				description: isUpgrade
					? `Billing units increased from ${oldUnits} to ${newUnits}`
					: `Billing units decreased from ${oldUnits} to ${newUnits}`,
				oldValue: `${oldUnits} units`,
				newValue: `${newUnits} units`,
				isUpgrade,
			});
		}
	}

	if (
		isPrepaid &&
		initialPrepaidQuantity !== undefined &&
		prepaidQuantity !== undefined &&
		prepaidQuantity !== initialPrepaidQuantity
	) {
		const isUpgrade = prepaidQuantity > initialPrepaidQuantity;
		edits.push({
			id: `prepaid-${item.feature_id}`,
			type: "prepaid",
			icon: "prepaid",
			label: "Prepaid Quantity",
			description: isUpgrade
				? `Prepaid quantity increased from ${initialPrepaidQuantity} to ${prepaidQuantity}`
				: `Prepaid quantity decreased from ${initialPrepaidQuantity} to ${prepaidQuantity}`,
			oldValue: `${initialPrepaidQuantity} Prepaid`,
			newValue: `${prepaidQuantity} Prepaid`,
			isUpgrade,
			editable: true,
		});
	}

	return edits;
}
