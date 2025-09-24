import { type ProductItem, productV2ToFeatureItems } from "@autumn/shared";
import { useProductContext } from "@/views/products/product/ProductContext";
import { AddFeatureRow } from "./AddFeatureRow";
import { PlanFeatureRow } from "./PlanFeatureRow";

export const PlanFeatureList = () => {
	const { product, setProduct, setSheet, editingState, setEditingState } =
		useProductContext();

	const filteredItems = productV2ToFeatureItems({ items: product?.items });

	const handleFeatureClick = (item: ProductItem) => {
		console.log("Feature clicked:", item);
	};

	const handleEdit = (item: ProductItem) => {
		// Use array index as stable ID - won't change during editing
		const itemIndex =
			product?.items?.findIndex((i: ProductItem) => i === item) || 0;
		const itemId = item.entitlement_id || item.price_id || `item-${itemIndex}`;

		setEditingState({ type: "feature", id: itemId });
		setSheet("edit-feature");
	};

	const handleDelete = (item: ProductItem) => {
		console.log("Delete feature:", item);
		if (!product?.items) return;

		// Remove the item from the product
		const newItems = product.items.filter((i: ProductItem) => i !== item);
		const updatedProduct = { ...product, items: newItems };
		setProduct(updatedProduct);

		// Close editing sidebar if this item was being edited
		const itemIndex = product.items.findIndex((i: ProductItem) => i === item);
		const itemId = item.entitlement_id || item.price_id || `item-${itemIndex}`;
		if (editingState.id === itemId) {
			setEditingState({ type: null, id: null });
			setSheet(null);
		}
	};

	const handleAddFeature = () => {
		setEditingState({ type: "feature", id: "new" });
		setSheet("edit-feature");
	};

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
		<div className="space-y-2">
			<h4 className="text-sm font-medium text-foreground mb-2">Features</h4>
			{filteredItems.map((item: ProductItem, index: number) => {
				const itemId = item.entitlement_id || item.price_id || `item-${index}`;
				const isBeingEdited =
					editingState.type === "feature" && editingState.id === itemId;

				return (
					<PlanFeatureRow
						key={item.entitlement_id || item.price_id || index}
						item={item}
						index={index}
						onRowClick={handleFeatureClick}
						onEdit={handleEdit}
						onDelete={handleDelete}
						editDisabled={isBeingEdited}
					/>
				);
			})}
			<AddFeatureRow
				onClick={handleAddFeature}
				disabled={editingState.type === "feature" && editingState.id === "new"}
			/>
		</div>
	);
};
