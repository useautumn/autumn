import { type ProductItem, productV2ToFeatureItems } from "@autumn/shared";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import {
	useDiscardItemAndClose,
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetContainer } from "@/components/v2/sheets/InlineSheet";
import { SheetCloseButton } from "@/components/v2/sheets/SheetCloseButton";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getItemId } from "@/utils/product/productItemUtils";

import { ProductItemContext } from "../product/product-item/ProductItemContext";
import { EditPlanPriceSheet } from "./components/EditPlanPriceSheet";
import { EditPlanSheet } from "./components/EditPlanSheet";
import { EditPlanFeatureSheet } from "./components/edit-plan-feature/EditPlanFeatureSheet";
import { NewFeatureSheet } from "./components/new-feature/NewFeatureSheet";
import { SelectFeatureSheet } from "./components/SelectFeatureSheet";
import { SHEET_ANIMATION } from "./planAnimations";

export const ProductSheets = () => {
	const isMobile = useIsMobile();
	const { product, setProduct } = useProduct();
	const {
		sheetType,
		itemId,
		initialItem,
		setInitialItem,
		closeSheet,
		itemDraft,
	} = useSheet();
	const {
		enabled: hasDraftItemSessionSupport,
		session: draftItemSession,
		startItem: startItemDraft,
		updateItem: updateItemDraft,
		commitItem: commitItemDraft,
		clearItemSession: clearItemDraftSession,
	} = itemDraft;

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
		if (
			sheetType === "edit-feature" &&
			itemId !== null &&
			itemId !== lastItemIdRef.current &&
			currentItem
		) {
			if (hasDraftItemSessionSupport) {
				startItemDraft({ itemId, item: currentItem });
			} else {
				setInitialItem(structuredClone(currentItem));
			}

			lastItemIdRef.current = itemId;
		}

		if (itemId === null) {
			lastItemIdRef.current = null;
			if (hasDraftItemSessionSupport) {
				clearItemDraftSession();
			}
		}
	}, [
		sheetType,
		itemId,
		currentItem,
		setInitialItem,
		hasDraftItemSessionSupport,
		startItemDraft,
		clearItemDraftSession,
	]);

	useEffect(() => {
		if (hasDraftItemSessionSupport && sheetType !== "edit-feature") {
			clearItemDraftSession();
		}
	}, [hasDraftItemSessionSupport, sheetType, clearItemDraftSession]);

	const setCurrentItem = (updatedItem: ProductItem) => {
		if (
			hasDraftItemSessionSupport &&
			draftItemSession &&
			draftItemSession.itemId === itemId
		) {
			updateItemDraft({ item: updatedItem });
			return;
		}

		if (!product || !product.items) return;

		const currentItemIndex = product.items.findIndex(isCurrentItem);

		if (currentItemIndex === -1) return;

		const updatedItems = [...product.items];
		updatedItems[currentItemIndex] = updatedItem;
		setProduct({ ...product, items: updatedItems });
	};

	const hasActiveDraftItemSession =
		hasDraftItemSessionSupport &&
		draftItemSession !== null &&
		draftItemSession.itemId === itemId;

	const activeItem = hasActiveDraftItemSession
		? draftItemSession.draftItem
		: (currentItem ?? null);

	const activeInitialItem = hasActiveDraftItemSession
		? draftItemSession.initialItem
		: initialItem;

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
							item: activeItem,
							initialItem: activeInitialItem,
							setItem: setCurrentItem,
							selectedIndex: 0,
							showCreateFeature: false,
							setShowCreateFeature: () => {},
							isUpdate: false,
							handleUpdateProductItem: async () => {
								if (hasDraftItemSessionSupport) {
									commitItemDraft();
								}
								closeSheet();
								return null;
							},
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
					style={{ width: isMobile ? "100%" : "28rem", zIndex: 100 }}
				>
					<SheetContainer className="w-full bg-background z-50 md:border-l border-border/40 h-full relative">
						<SheetCloseButton onClose={discardAndClose} />
						{renderSheet()}
					</SheetContainer>
				</motion.div>
			)}
		</AnimatePresence>
	);
};
