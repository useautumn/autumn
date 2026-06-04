import { type ProductItem, productV2ToFeatureItems } from "@autumn/shared";
import { useEffect, useRef } from "react";
import {
	useDiscardItemAndClose,
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { InlineSheetPanel } from "@/components/v2/sheets/InlineSheetPanel";
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
	const {
		sheetType,
		itemId,
		initialItem,
		setInitialItem,
		updateItemId,
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

	const matchedItemIndex = product.items
		? product.items.findIndex(
				(item, index) =>
					!!item &&
					featureItems.includes(item) &&
					getItemId({ item, itemIndex: index }) === itemId,
			)
		: -1;

	const editingIndexRef = useRef<number | null>(null);

	useEffect(() => {
		if (matchedItemIndex !== -1) {
			editingIndexRef.current = matchedItemIndex;
		} else if (itemId === null) {
			editingIndexRef.current = null;
		}
	}, [matchedItemIndex, itemId]);

	const resolvedItemIndex =
		matchedItemIndex !== -1
			? matchedItemIndex
			: editingIndexRef.current !== null &&
					editingIndexRef.current < (product.items?.length ?? 0)
				? editingIndexRef.current
				: -1;

	const currentItem =
		resolvedItemIndex !== -1 ? product.items?.[resolvedItemIndex] : undefined;

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

		if (!product || !product.items || resolvedItemIndex === -1) return;

		const newItemId = getItemId({
			item: updatedItem,
			itemIndex: currentItemIndex,
		});
		if (newItemId !== itemId) {
			updateItemId(newItemId);
		}

		const updatedItems = [...product.items];
		updatedItems[resolvedItemIndex] = updatedItem;
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
						<EditPlanFeatureSheet key={itemId} />
					</ProductItemContext.Provider>
				);
			case "new-feature":
				return <NewFeatureSheet />;
			case "select-feature":
				return <SelectFeatureSheet />;
		}
	};

	return (
		<InlineSheetPanel
			isOpen={!!sheetType}
			onClose={discardAndClose}
			transition={SHEET_ANIMATION}
		>
			{renderSheet()}
		</InlineSheetPanel>
	);
};
