import { type ProductItem, productV2ToFeatureItems } from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import {
	useIsCreatingFeature,
	useSheetStore,
} from "@/hooks/stores/useSheetStore";
import { getItemId } from "@/utils/product/productItemUtils";
import { AddFeatureRow } from "./AddFeatureRow";
import { DummyPlanFeatureRow } from "./DummyPlanFeatureRow";
import { PlanFeatureRow } from "./PlanFeatureRow";

export const PlanFeatureList = ({
	allowAddFeature = true,
}: {
	allowAddFeature?: boolean;
}) => {
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);
	const setSheet = useSheetStore((s) => s.setSheet);
	const sheetType = useSheetStore((s) => s.type);
	const itemId = useSheetStore((s) => s.itemId);
	const isCreatingFeature = useIsCreatingFeature();
	const { features } = useFeaturesQuery();

	// Disable add button when select-feature or new-feature sheet is open
	const isAddButtonDisabled =
		isCreatingFeature || sheetType === "select-feature";

	// Guard against undefined product
	if (!product) return null;

	const filteredItems = productV2ToFeatureItems({ items: product.items });

	// Group items by entity_feature_id
	const groupedItems = filteredItems.reduce(
		(acc, item) => {
			const key = item.entity_feature_id || "no_entity";
			if (!acc[key]) {
				acc[key] = [];
			}
			acc[key].push(item);
			return acc;
		},
		{} as Record<string, ProductItem[]>,
	);

	const handleDelete = (item: ProductItem) => {
		if (!product.items) return;

		// Remove the item from the product
		const newItems = product.items.filter((i: ProductItem) => i !== item);
		const updatedProduct = { ...product, items: newItems };
		setProduct(updatedProduct);

		// Close editing sidebar if this item was being edited
		const itemIndex = product.items.findIndex((i: ProductItem) => i === item);
		const currentItemId = getItemId({ item, itemIndex });
		if (itemId === currentItemId) {
			setSheet({ type: "edit-plan" });
		}
	};

	const handleAddFeature = () => {
		setSheet({ type: "new-feature", itemId: "new" });
	};

	// Show dummy row when creating a new feature
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

	const groups = Object.entries(groupedItems).sort(([keyA], [keyB]) => {
		// "no_entity" should always come first
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
						{items.map((item: ProductItem) => {
							const itemIndex = filteredItems.indexOf(item);
							return (
								<PlanFeatureRow
									key={item.entitlement_id || item.price_id || itemIndex}
									item={item}
									index={itemIndex}
									onDelete={handleDelete}
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
					<AddFeatureRow
						onClick={handleAddFeature}
						disabled={isAddButtonDisabled}
					/>
				))}
		</div>
	);
};
