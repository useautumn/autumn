import type { ProductItem } from "@autumn/shared";
import { isPriceItem } from "@/utils/product/getItemType";
import { useProductContext } from "@/views/products/product/ProductContext";
import { AddFeatureRow } from "./AddFeatureRow";
import { PlanFeatureRow } from "./PlanFeatureRow";

export const PlanFeatureList = () => {
	const { product, setSheet, editingState, setEditingState } =
		useProductContext();

	const handleFeatureClick = (item: ProductItem) => {
		console.log("Feature clicked:", item);
	};

	const handleEdit = (item: ProductItem) => {
		console.log("Edit feature:", item);
		// Use array index as stable ID - won't change during editing
		const itemIndex = product?.items?.findIndex((i) => i === item) || 0;
		const itemId = item.entitlement_id || item.price_id || `item-${itemIndex}`;
		setEditingState({ type: "feature", id: itemId });
		setSheet("edit-feature");
	};

	const handleDelete = (item: ProductItem) => {
		// Add your delete logic here
	};

	const handleAddFeature = () => {
		setEditingState({ type: "feature", id: "new" });
		setSheet("edit-feature");
	};

	// Filter out standalone price items - only show features and priced features
	const filteredItems =
		product?.items?.filter((item: ProductItem) => !isPriceItem(item)) || [];

	if (filteredItems.length === 0) {
		return (
			<div className="space-y-1">
				<h4 className="text-sm font-medium text-foreground mb-2">Features</h4>
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
		<div className="space-y-1">
			<h4 className="text-sm font-medium text-foreground mb-2">Features</h4>
			<div className="space-y-1">
				{filteredItems.map((item: ProductItem, index: number) => {
					const itemId =
						item.entitlement_id || item.price_id || `item-${index}`;
					const isBeingEdited =
						editingState.type === "feature" && editingState.id === itemId;

					return (
						<PlanFeatureRow
							key={item.entitlement_id || item.price_id || index}
							item={item}
							onRowClick={handleFeatureClick}
							onEdit={handleEdit}
							onDelete={handleDelete}
							editDisabled={isBeingEdited}
						/>
					);
				})}
				<AddFeatureRow
					onClick={handleAddFeature}
					disabled={
						editingState.type === "feature" && editingState.id === "new"
					}
				/>
			</div>
		</div>
	);
};
