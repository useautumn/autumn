import {
	type ProductItem,
	productV2ToFeatureItems,
	sortPlanItems,
	splitBooleanItems,
} from "@autumn/shared";
import { useMemo } from "react";
import { CollapsedBooleanItems } from "@/components/forms/shared/plan-items/CollapsedBooleanItems";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getItemId } from "@/utils/product/productItemUtils";
import { AddFeatureRow } from "./AddFeatureRow";
import { DummyPlanFeatureRow } from "./DummyPlanFeatureRow";
import { PlanFeatureRow } from "./PlanFeatureRow";

function EntityGroupHeader({ entityFeatureId }: { entityFeatureId: string }) {
	const { features } = useFeaturesQuery();
	const feature = features.find((f) => f.id === entityFeatureId);
	return (
		<div className="text-sm font-medium text-body-secondary px-2 pt-2">
			{feature?.name || entityFeatureId}
		</div>
	);
}

export const PlanFeatureList = ({
	allowAddFeature = true,
}: {
	allowAddFeature?: boolean;
}) => {
	const { product, setProduct } = useProduct();
	const { sheetType, itemId, setSheet } = useSheet();

	const isCreatingFeature = sheetType === "new-feature" || itemId === "new";
	const isAddButtonDisabled =
		isCreatingFeature || sheetType === "select-feature";

	const filteredItems = useMemo(
		() => (product ? productV2ToFeatureItems({ items: product.items }) : []),
		[product],
	);
	const sortedItems = useMemo(
		() => sortPlanItems({ items: filteredItems }),
		[filteredItems],
	);
	const { visibleItems, collapsedBooleanItems } = useMemo(
		() => splitBooleanItems({ items: sortedItems }),
		[sortedItems],
	);

	if (!product) return null;

	const hasEntityItems = sortedItems.some((i) => i.entity_feature_id);

	const handleDelete = (item: ProductItem) => {
		if (!product.items) return;

		const newItems = product.items.filter((i: ProductItem) => i !== item);
		const updatedProduct = { ...product, items: newItems };
		setProduct(updatedProduct);

		const itemIndex = product.items.findIndex((i: ProductItem) => i === item);
		const currentItemId = getItemId({ item, itemIndex });
		if (itemId === currentItemId) {
			setSheet({ type: "edit-plan" });
		}
	};

	const handleAddFeature = () => {
		setSheet({ type: "new-feature", itemId: "new" });
	};

	const isCreatingNewFeature = sheetType === "new-feature";

	if (filteredItems.length === 0) {
		return (
			<div className="space-y-1">
				<div className="space-y-1">
					{isCreatingNewFeature ? (
						<DummyPlanFeatureRow />
					) : (
						<AddFeatureRow
							onClick={handleAddFeature}
							disabled={isAddButtonDisabled}
						/>
					)}
				</div>
			</div>
		);
	}

	const renderFeatureRow = (item: ProductItem) => {
		const itemIndex = product.items?.indexOf(item) ?? -1;
		return (
			<PlanFeatureRow
				key={item.entitlement_id || item.price_id || itemIndex}
				item={item}
				index={itemIndex}
				onDelete={handleDelete}
			/>
		);
	};

	const renderVisibleItems = () => {
		const elements: React.ReactNode[] = [];
		let lastEntityId: string | null | undefined;

		for (const item of visibleItems) {
			if (
				hasEntityItems &&
				item.entity_feature_id &&
				item.entity_feature_id !== lastEntityId
			) {
				elements.push(
					<EntityGroupHeader
						key={`header-${item.entity_feature_id}`}
						entityFeatureId={item.entity_feature_id}
					/>,
				);
			}
			lastEntityId = item.entity_feature_id;
			elements.push(renderFeatureRow(item));
		}

		return elements;
	};

	return (
		<div className="space-y-2">
			{renderVisibleItems()}

			{collapsedBooleanItems.length > 0 && (
				<CollapsedBooleanItems
					items={collapsedBooleanItems}
					renderItem={(item) => renderFeatureRow(item)}
				/>
			)}

			{allowAddFeature &&
				(isCreatingNewFeature ? (
					<DummyPlanFeatureRow />
				) : (
					<AddFeatureRow
						onClick={handleAddFeature}
						disabled={isAddButtonDisabled}
					/>
				))}
		</div>
	);
};
