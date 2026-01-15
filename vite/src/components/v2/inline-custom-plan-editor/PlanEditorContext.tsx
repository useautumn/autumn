import type { FrontendProduct } from "@autumn/shared";
import { createContext, type ReactNode, useContext } from "react";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";

interface ProductContextValue {
	product: FrontendProduct;
	setProduct: (
		product: FrontendProduct | ((prev: FrontendProduct) => FrontendProduct),
	) => void;
	setSheet: (params: { type: string | null; itemId?: string | null }) => void;
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
	setSheet,
}: {
	children: ReactNode;
	product: FrontendProduct;
	setProduct: (
		product: FrontendProduct | ((prev: FrontendProduct) => FrontendProduct),
	) => void;
	setSheet: (params: { type: string | null; itemId?: string | null }) => void;
}) {
	return (
		<ProductContext.Provider value={{ product, setProduct, setSheet }}>
			{children}
		</ProductContext.Provider>
	);
}

/**
 * Hook to get product and setProduct.
 * Uses ProductContext if available, otherwise falls back to useProductStore.
 */
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

/**
 * Hook to get setSheet.
 * Uses ProductContext if available, otherwise falls back to useSheetStore.
 */
export function useSheet() {
	const context = useContext(ProductContext);
	const storeSetSheet = useSheetStore((s) => s.setSheet);

	if (context) {
		return { setSheet: context.setSheet };
	}

	return { setSheet: storeSetSheet };
}
