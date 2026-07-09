import {
	type FrontendProduct,
	type ProductItem,
	sortPlanItems,
	splitBooleanItems,
	UsageModel,
} from "@autumn/shared";
import { useMemo } from "react";
import type { AdminPlanIds } from "@/components/forms/shared/admin/AdminPlanIdsTooltip";
import { CollapsedBooleanItems } from "@/components/forms/shared/plan-items/CollapsedBooleanItems";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { BasePriceDisplay } from "@/views/products/plan/components/plan-card/BasePriceDisplay";
import { PlanFeatureRow } from "@/views/products/plan/components/plan-card/PlanFeatureRow";

/** Read-only price + feature rows for detail sheets (subscription, license). */
export function SubscriptionDetailItems({
	items,
	product,
	prepaidDisplayQuantities = {},
	adminIds,
}: {
	items: ProductItem[];
	product: FrontendProduct;
	prepaidDisplayQuantities?: Record<string, number>;
	adminIds?: AdminPlanIds;
}) {
	const sortedItems = useMemo(() => sortPlanItems({ items }), [items]);
	const { visibleItems, collapsedBooleanItems } = useMemo(
		() => splitBooleanItems({ items: sortedItems }),
		[sortedItems],
	);

	const renderRow = (item: ProductItem, index: number) => {
		if (!item.feature_id) return null;
		const prepaidQuantity =
			item.usage_model === UsageModel.Prepaid
				? (prepaidDisplayQuantities[item.feature_id] ?? null)
				: null;

		return (
			<PlanFeatureRow
				key={`${index}-${item.feature_id ?? ""}-${item.price_id ?? ""}-${item.entitlement_id ?? ""}`}
				item={item}
				index={index}
				readOnly={true}
				prepaidQuantity={prepaidQuantity}
			/>
		);
	};

	return (
		<SheetSection>
			<div className="flex gap-2 justify-between items-center h-6 mb-1">
				<BasePriceDisplay
					product={product}
					readOnly={true}
					adminIds={adminIds}
				/>
			</div>

			<div className="flex flex-col gap-0">
				{visibleItems.map((item, index) => renderRow(item, index))}
				{collapsedBooleanItems.length > 0 && (
					<CollapsedBooleanItems
						items={collapsedBooleanItems}
						triggerClassName="pl-0 pr-1"
						renderItem={(item, index) =>
							renderRow(item, visibleItems.length + index)
						}
					/>
				)}
			</div>
		</SheetSection>
	);
}
