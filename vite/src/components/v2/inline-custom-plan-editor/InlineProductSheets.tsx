import { type ProductItem, productV2ToFeatureItems } from "@autumn/shared";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef } from "react";
import { SheetContainer } from "@/components/v2/sheets/InlineSheet";
import { SheetCloseButton } from "@/components/v2/sheets/SheetCloseButton";
import { getItemId } from "@/utils/product/productItemUtils";
import { EditPlanPriceSheet } from "@/views/products/plan/components/EditPlanPriceSheet";
import { EditPlanSheet } from "@/views/products/plan/components/EditPlanSheet";
import { EditPlanFeatureSheet } from "@/views/products/plan/components/edit-plan-feature/EditPlanFeatureSheet";
import { NewFeatureSheet } from "@/views/products/plan/components/new-feature/NewFeatureSheet";
import { SelectFeatureSheet } from "@/views/products/plan/components/SelectFeatureSheet";
import { ProductProvider } from "./PlanEditorContext";
import { SHEET_ANIMATION } from "@/views/products/plan/planAnimations";
import { ProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { useInlineEditorContext } from "./InlineEditorContext";

export function InlineProductSheets() {
	const {
		product,
		setProduct,
		sheetType,
		setSheet,
		itemId,
		initialItem,
		setInitialItem,
		closeSheet,
	} = useInlineEditorContext();

	const featureItems = productV2ToFeatureItems({ items: product.items });

	const isCurrentItem = useCallback(
		(item: ProductItem) => {
			const actualIndex = product.items?.indexOf(item) ?? -1;
			const currentItemId = getItemId({ item, itemIndex: actualIndex });
			return itemId === currentItemId;
		},
		[product.items, itemId],
	);

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

	const setCurrentItem = useCallback(
		(updatedItem: ProductItem) => {
			if (!product?.items) return;

			const currentItemIndex = product.items.findIndex(isCurrentItem);
			if (currentItemIndex === -1) return;

			const updatedItems = [...product.items];
			updatedItems[currentItemIndex] = updatedItem;
			setProduct({ ...product, items: updatedItems });
		},
		[product, setProduct, isCurrentItem],
	);

	const discardAndClose = useCallback(() => {
		if (initialItem) {
			setCurrentItem(initialItem);
		}
		closeSheet();
	}, [initialItem, setCurrentItem, closeSheet]);

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
			default:
				return null;
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
					<ProductProvider
						product={product}
						setProduct={setProduct}
						setSheet={setSheet}
					>
						<SheetContainer className="w-full bg-background z-50 border-l border-border/40 h-full relative">
							<SheetCloseButton onClose={discardAndClose} />
							{renderSheet()}
						</SheetContainer>
					</ProductProvider>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
