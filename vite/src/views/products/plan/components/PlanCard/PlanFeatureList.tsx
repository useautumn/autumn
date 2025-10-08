import { type ProductItem, productV2ToFeatureItems } from "@autumn/shared";
import { getItemId } from "@/utils/product/productItemUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { AddFeatureRow } from "./AddFeatureRow";
import { PlanFeatureRow } from "./PlanFeatureRow";

export const PlanFeatureList = ({
	allowAddFeature = true,
}: {
	allowAddFeature?: boolean;
}) => {
	const { product, setProduct, setSheet, editingState, setEditingState } =
		useProductContext();

	const filteredItems = productV2ToFeatureItems({ items: product?.items });

	const handleDelete = (item: ProductItem) => {
		if (!product?.items) return;

		// Remove the item from the product
		const newItems = product.items.filter((i: ProductItem) => i !== item);
		const updatedProduct = { ...product, items: newItems };
		setProduct(updatedProduct);

		// Close editing sidebar if this item was being edited
		const itemIndex = product.items.findIndex((i: ProductItem) => i === item);
		const itemId = getItemId({ item, itemIndex });
		if (editingState.id === itemId) {
			setEditingState({ type: "edit-plan", id: null });
			setSheet("edit-plan");
		}
	};

	const handleAddFeature = () => {
		setEditingState({ type: "feature", id: "new" });
		setSheet("edit-feature");
	};

	if (filteredItems.length === 0) {
		return (
			<div className="space-y-1">
				<div className="space-y-1">
					<AddFeatureRow
						onClick={handleAddFeature}
						disabled={
							editingState.type === "feature" && editingState.id === "new"
						}
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
					disabled={
						editingState.type === "feature" && editingState.id === "new"
					}
				/>
			)}
		</div>
	);
};
