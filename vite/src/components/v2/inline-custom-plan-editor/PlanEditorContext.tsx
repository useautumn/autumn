import {
	type FrontendProduct,
	itemsAreSame,
	type ProductItem,
	type ProductV2,
	productsAreSame,
	productV2ToFeatureItems,
} from "@autumn/shared";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
} from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { getItemId } from "@/utils/product/productItemUtils";

interface ProductContextValue {
	product: FrontendProduct;
	setProduct: (
		product: FrontendProduct | ((prev: FrontendProduct) => FrontendProduct),
	) => void;
	initialProduct?: FrontendProduct;
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
	initialProduct,
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
	initialProduct?: FrontendProduct;
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
				initialProduct,
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
			initialProduct: context.initialProduct,
		};
	}

	return {
		product: storeProduct,
		setProduct: storeSetProduct,
		initialProduct: undefined,
	};
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

/** Hook to get current item being edited. Uses context if available, otherwise Zustand. */
export function useCurrentItem() {
	const { product } = useProduct();
	const { itemId } = useSheet();

	return useMemo(() => {
		if (!itemId || !product?.items) return null;

		const featureItems = productV2ToFeatureItems({ items: product.items });

		for (let i = 0; i < product.items.length; i++) {
			const item = product.items[i];
			if (!item) continue;

			const isFeatureItem = featureItems.some((fi) => fi === item);
			if (!isFeatureItem) continue;

			const currentItemId = getItemId({ item, itemIndex: i });
			if (currentItemId === itemId) {
				return item;
			}
		}

		return null;
	}, [product, itemId]);
}

/** Hook to set the current item being edited. Uses context if available, otherwise Zustand. */
export function useSetCurrentItem() {
	const { product, setProduct } = useProduct();
	const { itemId } = useSheet();

	return useCallback(
		(updatedItem: ProductItem) => {
			if (!product || !product.items || !itemId) return;

			let originalIndex = -1;
			for (let i = 0; i < product.items.length; i++) {
				const item = product.items[i];
				if (!item) continue;

				const currentItemId = getItemId({ item, itemIndex: i });
				if (currentItemId === itemId) {
					originalIndex = i;
					break;
				}
			}

			if (originalIndex === -1) return;

			const updatedItems = [...product.items];
			updatedItems[originalIndex] = updatedItem;
			setProduct({ ...product, items: updatedItems });
		},
		[product, setProduct, itemId],
	);
}

/** Hook to check if the current item has unsaved changes. Uses context if available, otherwise Zustand. */
export function useHasItemChanges() {
	const item = useCurrentItem();
	const { initialItem } = useSheet();
	const { features = [] } = useFeaturesQuery();

	return useMemo(() => {
		if (!item || !initialItem) return false;

		const { same } = itemsAreSame({
			item1: item,
			item2: initialItem,
			features,
		});

		return !same;
	}, [item, initialItem, features]);
}

/** Hook to discard item changes (restore to initial state) and close the sheet. Uses context if available, otherwise Zustand. */
export function useDiscardItemAndClose() {
	const setCurrentItem = useSetCurrentItem();
	const { initialItem, closeSheet } = useSheet();

	return useCallback(() => {
		if (initialItem) {
			setCurrentItem(initialItem);
		}
		closeSheet();
	}, [initialItem, setCurrentItem, closeSheet]);
}

/** Hook to check if the product has unsaved changes compared to initial state. Only works in context mode. */
export function useHasPlanChanges() {
	const { product, initialProduct } = useProduct();
	const { features = [] } = useFeaturesQuery();

	return useMemo(() => {
		if (!initialProduct) return false;

		const { itemsSame } = productsAreSame({
			newProductV2: product as unknown as ProductV2,
			curProductV2: initialProduct as unknown as ProductV2,
			features,
		});

		return !itemsSame;
	}, [product, initialProduct, features]);
}
