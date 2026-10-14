import {
	type FrontendProduct,
	type ProductItem,
	sortPlanItems,
} from "@autumn/shared";
import { useCallback, useMemo, useState } from "react";
import { useItemDraftController } from "@/hooks/inline-editor/useItemDraftController";
import type { ProductContextValue } from "./PlanEditorContext";

export function useInlineProductEditor({
	initialProduct: initialProductProp,
	onSheetOpenChange,
}: {
	initialProduct: FrontendProduct;
	onSheetOpenChange?: (open: boolean) => void;
}): ProductContextValue {
	const initialProduct = useMemo<FrontendProduct>(
		() => ({
			...initialProductProp,
			items: sortPlanItems({ items: initialProductProp.items }),
		}),
		[initialProductProp],
	);

	const [sheetType, setSheetType] = useState<string | null>(null);
	const [itemId, setItemId] = useState<string | null>(null);
	const [initialItem, setInitialItem] = useState<ProductItem | null>(null);

	const itemDraft = useItemDraftController({
		initialProduct,
		setInitialItemState: setInitialItem,
	});

	const product = itemDraft.draftProduct ?? initialProduct;

	const setProduct = useCallback<ProductContextValue["setProduct"]>(
		(nextProduct) => {
			const previousProduct = itemDraft.draftProduct ?? initialProduct;
			const resolved =
				typeof nextProduct === "function"
					? nextProduct(previousProduct)
					: nextProduct;
			itemDraft.patchProduct({ product: resolved });
		},
		[itemDraft, initialProduct],
	);

	const setSheet = useCallback<ProductContextValue["setSheet"]>(
		({ type, itemId: nextItemId = null }) => {
			const wasOpen = sheetType !== null;
			const willOpen = type !== null;
			if (willOpen !== wasOpen) onSheetOpenChange?.(willOpen);
			setSheetType(type);
			setItemId(nextItemId);
			itemDraft.clearItemSession();
		},
		[itemDraft, onSheetOpenChange, sheetType],
	);

	const closeSheet = useCallback(() => {
		if (sheetType !== null) onSheetOpenChange?.(false);
		setSheetType(null);
		setItemId(null);
		itemDraft.clearItemSession();
	}, [itemDraft, onSheetOpenChange, sheetType]);

	const normalizedInitialProduct = useMemo(
		() => itemDraft.initialProduct ?? initialProduct,
		[itemDraft.initialProduct, initialProduct],
	);

	return {
		product,
		setProduct,
		initialProduct: normalizedInitialProduct,
		sheetType,
		itemId,
		initialItem,
		setSheet,
		setInitialItem,
		updateItemId: setItemId,
		closeSheet,
		itemDraft,
	};
}
