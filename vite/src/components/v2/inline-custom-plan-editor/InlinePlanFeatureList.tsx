import { type ProductItem, productV2ToFeatureItems } from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { DummyPlanFeatureRow } from "@/views/products/plan/components/plan-card/DummyPlanFeatureRow";
import { InlineAddFeatureRow } from "./InlineAddFeatureRow";
import { useInlineEditorContext } from "./InlineEditorContext";
import { InlinePlanFeatureRow } from "./InlinePlanFeatureRow";

export function InlinePlanFeatureList({
	allowAddFeature = true,
}: {
	allowAddFeature?: boolean;
}) {
	const { product, sheetType } = useInlineEditorContext();
	const { features } = useFeaturesQuery();

	if (!product) return null;

	const filteredItems = productV2ToFeatureItems({ items: product.items });
	const isAddButtonDisabled =
		sheetType === "new-feature" || sheetType === "select-feature";
	const isCreatingNewFeature = sheetType === "new-feature";

	if (filteredItems.length === 0) {
		return (
			<div className="space-y-1">
				{isCreatingNewFeature ? (
					<DummyPlanFeatureRow />
				) : (
					<InlineAddFeatureRow disabled={isAddButtonDisabled} />
				)}
			</div>
		);
	}

	// Group items by entity_feature_id
	const groupedItems = filteredItems.reduce(
		(acc, item) => {
			const key = item.entity_feature_id || "no_entity";
			if (!acc[key]) acc[key] = [];
			acc[key].push(item);
			return acc;
		},
		{} as Record<string, ProductItem[]>,
	);

	const groups = Object.entries(groupedItems).sort(([keyA], [keyB]) => {
		if (keyA === "no_entity") return -1;
		if (keyB === "no_entity") return 1;
		return 0;
	});
	const hasEntityFeatureIds = groups.some(([key]) => key !== "no_entity");

	return (
		<div className="space-y-2">
			{groups.map(([entityFeatureId, items]) => {
				const feature = features.find((f) => f.id === entityFeatureId);
				const showHeader =
					hasEntityFeatureIds && entityFeatureId !== "no_entity";

				return (
					<div key={entityFeatureId} className="space-y-2">
						{showHeader && (
							<div className="text-sm font-medium text-body-secondary px-2 pt-2">
								{feature?.name || entityFeatureId}
							</div>
						)}
						{items.map((item) => {
							const itemIndex = product.items?.indexOf(item) ?? -1;
							return (
								<InlinePlanFeatureRow
									key={item.entitlement_id || item.price_id || itemIndex}
									item={item}
									index={itemIndex}
								/>
							);
						})}
					</div>
				);
			})}

			{allowAddFeature &&
				(isCreatingNewFeature ? (
					<DummyPlanFeatureRow />
				) : (
					<InlineAddFeatureRow disabled={isAddButtonDisabled} />
				))}
		</div>
	);
}
