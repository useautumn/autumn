import { type ProductItem, productV2ToFeatureItems } from "@autumn/shared";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetContainer } from "@/components/v2/sheets/InlineSheet";
import { SheetCloseButton } from "@/components/v2/sheets/SheetCloseButton";
import { useDiscardItemAndClose } from "@/hooks/stores/useProductStore";
import { getItemId } from "@/utils/product/productItemUtils";

import { ProductItemContext } from "../product/product-item/ProductItemContext";
import { EditPlanPriceSheet } from "./components/EditPlanPriceSheet";
import { EditPlanSheet } from "./components/EditPlanSheet";
import { EditPlanFeatureSheet } from "./components/edit-plan-feature/EditPlanFeatureSheet";
import { NewFeatureSheet } from "./components/new-feature/NewFeatureSheet";
import { SelectFeatureSheet } from "./components/SelectFeatureSheet";
import { SHEET_ANIMATION } from "./planAnimations";

export const ProductSheets = () => {
	const { product, setProduct } = useProduct();
	const { sheetType, itemId, initialItem, setInitialItem } = useSheet();

	const discardAndClose = useDiscardItemAndClose();

	const featureItems = productV2ToFeatureItems({ items: product.items });

	const isCurrentItem = (item: ProductItem) => {
		const actualIndex = product.items?.indexOf(item) ?? -1;
		const currentItemId = getItemId({ item, itemIndex: actualIndex });
		return itemId === currentItemId;
	};

	const currentItem = featureItems.find(isCurrentItem);

	const lastItemIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (itemId !== null && itemId !== lastItemIdRef.current && currentItem) {
			setInitialItem(structuredClone(currentItem));
			lastItemIdRef.current = itemId;
		}
		if (itemId === null) {
			lastItemIdRef.current = null;
		}
	}, [itemId, currentItem, setInitialItem]);

	const setCurrentItem = (updatedItem: ProductItem) => {
		if (!product || !product.items) return;

		const currentItemIndex = product.items.findIndex(isCurrentItem);

		if (currentItemIndex === -1) return;

		const updatedItems = [...product.items];
		updatedItems[currentItemIndex] = updatedItem;
		setProduct({ ...product, items: updatedItems });
	};

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
							initialItem,
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
					<SheetContainer className="w-full bg-background z-50 border-l border-border/40 h-full relative">
						<SheetCloseButton onClose={discardAndClose} />
						{renderSheet()}
					</SheetContainer>
				</motion.div>
			)}
		</AnimatePresence>
	);
};
