import type { FrontendProduct, ProductItem } from "@autumn/shared";
import { createContext, type ReactNode, useContext } from "react";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";

interface ProductContextValue {
	product: FrontendProduct;
	setProduct: (
		product: FrontendProduct | ((prev: FrontendProduct) => FrontendProduct),
	) => void;
	sheetType: string | null;
	itemId: string | null;
	initialItem: ProductItem | null;
	setSheet: (params: { type: string | null; itemId?: string | null }) => void;
	setInitialItem: (item: ProductItem | null) => void;
	closeSheet: () => void;
}

const ProductContext = createContext<ProductContextValue | null>(null);

/**
 * Provider that allows overriding the product and sheet state source.
 * When wrapped with this provider, child components will use the provided
 * values instead of the Zustand stores.
 */
export function ProductProvider({
	children,
	product,
	setProduct,
	sheetType,
	itemId,
	initialItem,
	setSheet,
	setInitialItem,
	closeSheet,
}: {
	children: ReactNode;
	product: FrontendProduct;
	setProduct: (
		product: FrontendProduct | ((prev: FrontendProduct) => FrontendProduct),
	) => void;
	sheetType: string | null;
	itemId: string | null;
	initialItem: ProductItem | null;
	setSheet: (params: { type: string | null; itemId?: string | null }) => void;
	setInitialItem: (item: ProductItem | null) => void;
	closeSheet: () => void;
}) {
	return (
		<ProductContext.Provider
			value={{
				product,
				setProduct,
				sheetType,
				itemId,
				initialItem,
				setSheet,
				setInitialItem,
				closeSheet,
			}}
		>
			{children}
		</ProductContext.Provider>
	);
}

/** Hook to get product and setProduct. Uses context if available, otherwise Zustand. */
export function useProduct() {
	const context = useContext(ProductContext);
	const storeProduct = useProductStore((s) => s.product);
	const storeSetProduct = useProductStore((s) => s.setProduct);

	if (context) {
		return {
			product: context.product,
			setProduct: context.setProduct,
		};
	}

	return { product: storeProduct, setProduct: storeSetProduct };
}

/** Hook to get sheet state and actions. Uses context if available, otherwise Zustand. */
export function useSheet() {
	const context = useContext(ProductContext);
	const storeSheetType = useSheetStore((s) => s.type);
	const storeItemId = useSheetStore((s) => s.itemId);
	const storeInitialItem = useSheetStore((s) => s.initialItem);
	const storeSetSheet = useSheetStore((s) => s.setSheet);
	const storeSetInitialItem = useSheetStore((s) => s.setInitialItem);
	const storeCloseSheet = useSheetStore((s) => s.closeSheet);

	if (context) {
		return {
			sheetType: context.sheetType,
			itemId: context.itemId,
			initialItem: context.initialItem,
			setSheet: context.setSheet,
			setInitialItem: context.setInitialItem,
			closeSheet: context.closeSheet,
		};
	}

	return {
		sheetType: storeSheetType,
		itemId: storeItemId,
		initialItem: storeInitialItem,
		setSheet: storeSetSheet,
		setInitialItem: storeSetInitialItem,
		closeSheet: storeCloseSheet,
	};
}
