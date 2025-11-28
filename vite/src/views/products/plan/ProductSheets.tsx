import { type ProductItem, productV2ToFeatureItems } from "@autumn/shared";
import { AnimatePresence, motion } from "motion/react";
import { SheetContainer } from "@/components/v2/sheets/InlineSheet";
import { SheetCloseButton } from "@/components/v2/sheets/SheetCloseButton";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { getItemId } from "@/utils/product/productItemUtils";

import { ProductItemContext } from "../product/product-item/ProductItemContext";
import { EditPlanPriceSheet } from "./components/EditPlanPriceSheet";
import { EditPlanSheet } from "./components/EditPlanSheet";
import { EditPlanFeatureSheet } from "./components/edit-plan-feature/EditPlanFeatureSheet";
import { NewFeatureSheet } from "./components/new-feature/NewFeatureSheet";
import { SelectFeatureSheet } from "./components/SelectFeatureSheet";
import { SHEET_ANIMATION } from "./planAnimations";

export const ProductSheets = () => {
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);
	const sheetType = useSheetStore((s) => s.type);
	const itemId = useSheetStore((s) => s.itemId);
	const closeSheet = useSheetStore((s) => s.closeSheet);

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
			case "edit-plan-price":
				return <EditPlanPriceSheet />;
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
			// default:
			// 	return <EditPlanSheet />;
		}
	};

	return (
		<AnimatePresence mode="wait">
			{sheetType && (
				<motion.div
					initial={{ x: "100%" }}
					animate={{ x: 0 }}
					exit={{ x: "100%" }}
					transition={SHEET_ANIMATION}
					className="absolute right-0 top-0 bottom-0"
					style={{ width: "28rem", zIndex: 100 }}
				>
					<SheetContainer className="w-full bg-background z-50 border-l dark:border-l-0 h-full relative">
						<SheetCloseButton onClose={closeSheet} />
						{renderSheet()}
					</SheetContainer>
				</motion.div>
			)}
		</AnimatePresence>
	);
};
