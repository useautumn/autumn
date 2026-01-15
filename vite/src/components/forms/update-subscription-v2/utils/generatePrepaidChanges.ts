import type { PrepaidItemWithFeature } from "@/hooks/stores/useProductStore";
import type { SummaryItem } from "../types/summary";

export function generatePrepaidChanges({
	prepaidItems,
	currentOptions,
	initialOptions,
	currency,
}: {
	prepaidItems: PrepaidItemWithFeature[];
	currentOptions: Record<string, number>;
	initialOptions: Record<string, number>;
	currency?: string;
}): SummaryItem[] {
	return prepaidItems
		.map((item) => {
			const featureId = item.feature_id ?? "";
			const oldQuantity = initialOptions[featureId] ?? 0;
			const newQuantity = currentOptions[featureId] ?? 0;

			if (oldQuantity === newQuantity) return null;

			// Apply billing units to show actual quantities
			const billingUnits = item.billing_units ?? 1;
			const oldDisplayQuantity = oldQuantity * billingUnits;
			const newDisplayQuantity = newQuantity * billingUnits;
			const quantityDelta = newDisplayQuantity - oldDisplayQuantity;

			const unitPrice = item.price ?? null;
			const costDelta =
				unitPrice !== null
					? (newQuantity - oldQuantity) * unitPrice
					: undefined;

			const featureName = item.feature?.name ?? "Items";

			const direction = quantityDelta > 0 ? "added" : "removed";
			const description = `${Math.abs(quantityDelta)} prepaid ${direction}`;

			return {
				id: `prepaid-${featureId}`,
				type: "prepaid" as const,
				label: featureName,
				description,
				oldValue: oldDisplayQuantity,
				newValue: newDisplayQuantity,
				costDelta,
				currency,
				productItem: item,
			};
		})
		.filter(Boolean) as SummaryItem[];
}
