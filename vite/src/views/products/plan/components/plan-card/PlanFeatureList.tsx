import { type ProductItem, productV2ToFeatureItems } from "@autumn/shared";
import { useProductStore } from "@/hooks/stores/useProductStore";
import {
	useIsCreatingFeature,
	useSheetStore,
} from "@/hooks/stores/useSheetStore";
import { getItemId } from "@/utils/product/productItemUtils";
import { AddFeatureRow } from "./AddFeatureRow";
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

	// Disable add button when select-feature or new-feature sheet is open
	const isAddButtonDisabled =
		isCreatingFeature || sheetType === "select-feature";

	// Guard against undefined product
	if (!product) return null;

	const filteredItems = productV2ToFeatureItems({ items: product.items });

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

	if (filteredItems.length === 0) {
		return (
			<div className="space-y-1">
				<div className="space-y-1">
					<AddFeatureRow
						onClick={handleAddFeature}
						disabled={isAddButtonDisabled}
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			{filteredItems.map((item: ProductItem, index: number) => {
				return (
					<PlanFeatureRow
						key={item.entitlement_id || item.price_id || index}
						item={item}
						index={index}
						onDelete={handleDelete}
					/>
				);
			})}

			{allowAddFeature && (
				<AddFeatureRow
					onClick={handleAddFeature}
					disabled={isAddButtonDisabled}
				/>
			)}
		</div>
	);
};
