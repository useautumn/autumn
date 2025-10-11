import { type ProductItem, productV2ToFeatureItems } from "@autumn/shared";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { getItemId } from "@/utils/product/productItemUtils";

import { ProductItemContext } from "../product/product-item/ProductItemContext";
import { EditPlanFeatureSheet } from "./components/EditPlanFeatureSheet/EditPlanFeatureSheet";
import { EditPlanSheet } from "./components/EditPlanSheet";
import { NewFeatureSheet } from "./components/new-feature/NewFeatureSheet";
import { SelectFeatureSheet } from "./components/SelectFeatureSheet";

export const ProductSheets = () => {
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);
	const sheetType = useSheetStore((s) => s.type);
	const itemId = useSheetStore((s) => s.itemId);

	const featureItems = productV2ToFeatureItems({ items: product.items });

	const isCurrentItem = (item: ProductItem, index: number) => {
		const currentItemId = getItemId({ item, itemIndex: index });
		return itemId === currentItemId;
	};

	const currentItem = featureItems.find(isCurrentItem);

	const setCurrentItem = (updatedItem: ProductItem) => {
		if (!product || !product.items) return;

		const filteredItems = productV2ToFeatureItems({
			items: product.items,
			withBasePrice: true,
		});

		const currentItemIndex = filteredItems.findIndex(isCurrentItem);

		if (currentItemIndex === -1) return;

		const updatedItems = [...filteredItems];
		updatedItems[currentItemIndex] = updatedItem;
		setProduct({ ...product, items: updatedItems });
	};

	// Don't render on small screens
	const renderSheet = () => {
		switch (sheetType) {
			case "edit-plan":
				return <EditPlanSheet />;
			case "edit-feature":
				return (
					<ProductItemContext.Provider
						value={{
							item: currentItem ?? null,
							setItem: setCurrentItem,
							selectedIndex: 0,
							showCreateFeature: false,
							setShowCreateFeature: () => {},
							isUpdate: false,
							handleUpdateProductItem: async () => null,
						}}
					>
						<EditPlanFeatureSheet />
					</ProductItemContext.Provider>
				);
			case "new-feature":
				return <NewFeatureSheet />;
			case "select-feature":
				return <SelectFeatureSheet />;
			default:
				return <EditPlanSheet />;
		}
	};

	return (
		<div className="w-full min-w-xs max-w-md bg-card z-50 border-l shadow-sm flex flex-col overflow-y-auto h-full">
			{renderSheet()}
		</div>
	);
};
