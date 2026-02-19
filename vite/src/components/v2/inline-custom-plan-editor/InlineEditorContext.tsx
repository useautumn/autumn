import type { FrontendProduct, ProductItem } from "@autumn/shared";
import { type ReactNode, useCallback, useMemo, useState } from "react";
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
	const [sheetType, setSheetType] = useState<SheetType>(null);
	const [itemId, setItemId] = useState<string | null>(null);
	const [initialItem, setInitialItemState] = useState<ProductItem | null>(null);

	const itemDraft = useItemDraftController({
		initialProduct,
		setInitialItemState,
	});

	const product = itemDraft.draftProduct ?? initialProduct;

	const setProduct = useCallback(
		(
			nextProduct:
				| FrontendProduct
				| ((prev: FrontendProduct) => FrontendProduct),
		) => {
			const previousProduct = itemDraft.draftProduct ?? initialProduct;
			const resolvedProduct =
				typeof nextProduct === "function"
					? nextProduct(previousProduct)
					: nextProduct;

			itemDraft.patchProduct({ product: resolvedProduct });
		},
		[itemDraft, initialProduct],
	);

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
			itemDraft.clearItemSession();
		},
		[itemDraft],
	);

	const setInitialItem = useCallback((item: ProductItem | null) => {
		setInitialItemState(item);
	}, []);

	const closeSheet = useCallback(() => {
		setSheetType(null);
		setItemId(null);
		itemDraft.clearItemSession();
	}, [itemDraft]);

	const normalizedInitialProduct = useMemo(
		() => itemDraft.initialProduct ?? initialProduct,
		[itemDraft.initialProduct, initialProduct],
	);

	return (
		<ProductProvider
			product={product}
			setProduct={setProduct}
			initialProduct={normalizedInitialProduct}
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
