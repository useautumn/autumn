import type { FrontendProduct, ProductItem } from "@autumn/shared";
import { type ReactNode, useCallback, useState } from "react";
import { useItemDraftController } from "@/hooks/inline-editor/useItemDraftController";
import { ProductProvider } from "./PlanEditorContext";

type SheetType =
	| "edit-plan"
	| "edit-plan-price"
	| "edit-feature"
	| "new-feature"
	| "select-feature"
	| null;

interface InlineEditorProviderProps {
	children: ReactNode;
	initialProduct: FrontendProduct;
}

/**
 * Provider for inline plan editing with local state.
 * Uses ProductProvider internally so child components can use useProduct/useSheet hooks.
 */
export function InlineEditorProvider({
	children,
	initialProduct,
}: InlineEditorProviderProps) {
	const [product, setProduct] = useState<FrontendProduct>(initialProduct);
	const [sheetType, setSheetType] = useState<SheetType>(null);
	const [itemId, setItemId] = useState<string | null>(null);
	const [initialItem, setInitialItemState] = useState<ProductItem | null>(null);

	const itemDraft = useItemDraftController({
		setProduct,
		setInitialItemState,
	});

	const setSheet = useCallback(
		({
			type,
			itemId = null,
		}: {
			type: string | null;
			itemId?: string | null;
		}) => {
			setSheetType(type as SheetType);
			setItemId(itemId);
			itemDraft.clear();
		},
		[itemDraft],
	);

	const setInitialItem = useCallback((item: ProductItem | null) => {
		setInitialItemState(item);
	}, []);

	const closeSheet = useCallback(() => {
		setSheetType(null);
		setItemId(null);
		itemDraft.clear();
	}, [itemDraft]);

	return (
		<ProductProvider
			product={product}
			setProduct={setProduct}
			initialProduct={initialProduct}
			sheetType={sheetType}
			itemId={itemId}
			initialItem={initialItem}
			setSheet={setSheet}
			setInitialItem={setInitialItem}
			closeSheet={closeSheet}
			itemDraft={itemDraft}
		>
			{children}
		</ProductProvider>
	);
}
