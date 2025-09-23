import type { ProductItem } from "@autumn/shared";
import { isPriceItem } from "@/utils/product/getItemType";
import { useProductContext } from "@/views/products/product/ProductContext";
import { PlanFeatureRow } from "./PlanFeatureRow";

export const PlanFeatureList = () => {
	const { product } = useProductContext();

	// Filter out standalone price items - only show features and priced features
	const filteredItems =
		product?.items?.filter((item: ProductItem) => !isPriceItem(item)) || [];

	if (filteredItems.length === 0) {
		return (
			<div className="text-center py-4 text-muted-foreground text-sm">
				No features configured for this plan
			</div>
		);
	}

	const handleFeatureClick = (item: ProductItem) => {
		console.log("Feature clicked:", item);
	};

	const handleDelete = (item: ProductItem) => {
		console.log("Delete feature:", item);
		// Add your delete logic here
	};

	return (
		<div className="space-y-1">
			<h4 className="text-sm font-medium text-foreground mb-2">Features</h4>
			<div className="space-y-2">
				{filteredItems.map((item: ProductItem, index: number) => (
					<PlanFeatureRow
						key={item.entitlement_id || item.price_id || index}
						item={item}
						onRowClick={handleFeatureClick}
						onDelete={handleDelete}
					/>
				))}
			</div>
		</div>
	);
};
