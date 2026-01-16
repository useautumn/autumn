import type { ProductItem } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { formatAmount } from "../../common/formatUtils/formatAmount.js";
import type { ItemEdit } from "./itemEditTypes.js";

/** Generates edit items for prepaid quantity changes */
export function generatePrepaidChanges({
	prepaidItems,
	originalOptions,
	updatedOptions,
	currency = "usd",
}: {
	prepaidItems: ProductItem[];
	originalOptions: Record<string, number>;
	updatedOptions: Record<string, number>;
	currency?: string;
}): ItemEdit[] {
	return prepaidItems
		.map((item) => {
			const featureId = item.feature_id ?? "";
			const oldQuantity = originalOptions[featureId] ?? 0;
			const newQuantity = updatedOptions[featureId] ?? 0;

			if (oldQuantity === newQuantity) return null;

			const billingUnits = item.billing_units ?? 1;
			const oldDisplayQuantity = oldQuantity * billingUnits;
			const newDisplayQuantity = newQuantity * billingUnits;

			const unitPrice = item.price ?? null;
			const costDelta =
				unitPrice !== null ? (newQuantity - oldQuantity) * unitPrice : null;

			const featureName = item.feature?.name ?? "Items";
			const isUpgrade = newQuantity > oldQuantity;

			let description = `Prepaid quantity changed from ${oldDisplayQuantity} to ${newDisplayQuantity}`;
			if (costDelta !== null && costDelta !== 0) {
				const formattedCost = formatAmount({
					amount: Math.abs(costDelta),
					currency,
					minFractionDigits: 2,
					amountFormatOptions: { currencyDisplay: "narrowSymbol" },
				});
				description += ` (${costDelta > 0 ? "+" : "-"}${formattedCost})`;
			}

			return {
				id: `prepaid-${featureId}`,
				type: "prepaid" as const,
				label: featureName,
				icon: "prepaid" as const,
				description,
				oldValue: oldDisplayQuantity,
				newValue: newDisplayQuantity,
				isUpgrade,
			};
		})
		.filter(Boolean) as ItemEdit[];
}
