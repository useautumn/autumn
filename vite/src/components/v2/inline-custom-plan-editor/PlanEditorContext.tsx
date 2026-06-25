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
	useEffect,
	useMemo,
	useRef,
} from "react";
import {
	disabledItemDraftController,
	type ItemDraftController,
} from "@/hooks/inline-editor/useItemDraftController";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { getItemId } from "@/utils/product/productItemUtils";

type SetProduct = (
	product: FrontendProduct | ((prev: FrontendProduct) => FrontendProduct),
) => void;

interface ProductContextValue {
	product: FrontendProduct;
	setProduct: SetProduct;
	initialProduct?: FrontendProduct;
	sheetType: string | null;
	itemId: string | null;
	initialItem: ProductItem | null;
	setSheet: (params: { type: string | null; itemId?: string | null }) => void;
	setInitialItem: (item: ProductItem | null) => void;
	updateItemId: (itemId: string) => void;
	closeSheet: () => void;
	itemDraft: ItemDraftController;
}

const ProductContext = createContext<ProductContextValue | null>(null);

/**
 * Returns the index of the feature item matching `itemId`, or -1 if none.
 * Base-price and other non-feature items are skipped so indexes line up with
 * the ids produced by getItemId().
 */
function findFeatureItemIndex(
	product: FrontendProduct,
	itemId: string,
): number {
	const items = product.items;
	if (!items) return -1;

	const featureItems = productV2ToFeatureItems({ items });

	return items.findIndex((item, index) => {
		if (!item || !featureItems.includes(item)) return false;
		return getItemId({ item, itemIndex: index }) === itemId;
	});
}

/** Compares two products field-by-field, hiding the V2 casts at a single site. */
function compareProducts(
	product: FrontendProduct,
	other: FrontendProduct,
	features: Parameters<typeof productsAreSame>[0]["features"],
) {
	return productsAreSame({
		newProductV2: product as unknown as ProductV2,
		curProductV2: other as unknown as ProductV2,
		features,
	});
}

/**
 * Provider that allows overriding the product and sheet state source.
 * When wrapped with this provider, child components will use the provided
 * values instead of the Zustand stores.
 */
export function ProductProvider({
	children,
	...value
}: ProductContextValue & { children: ReactNode }) {
	return (
		<ProductContext.Provider value={value}>{children}</ProductContext.Provider>
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
	const sheetType = useSheetStore((s) => s.type);
	const itemId = useSheetStore((s) => s.itemId);
	const initialItem = useSheetStore((s) => s.initialItem);
	const setSheet = useSheetStore((s) => s.setSheet);
	const setInitialItem = useSheetStore((s) => s.setInitialItem);
	const updateItemId = useSheetStore((s) => s.updateItemId);
	const closeSheet = useSheetStore((s) => s.closeSheet);

	if (context) {
		return {
			sheetType: context.sheetType,
			itemId: context.itemId,
			initialItem: context.initialItem,
			setSheet: context.setSheet,
			setInitialItem: context.setInitialItem,
			updateItemId: context.updateItemId,
			closeSheet: context.closeSheet,
			itemDraft: context.itemDraft,
		};
	}

	return {
		sheetType,
		itemId,
		initialItem,
		setSheet,
		setInitialItem,
		updateItemId,
		closeSheet,
		itemDraft: disabledItemDraftController,
	};
}

/** Hook to get current item being edited. Uses context if available, otherwise Zustand. */
export function useCurrentItem() {
	const context = useContext(ProductContext);
	const { product } = useProduct();
	const { itemId } = useSheet();
	const draftSession = context?.itemDraft.session;

	return useMemo(() => {
		if (!itemId || !product?.items) return null;
		if (draftSession?.itemId === itemId) return draftSession.draftItem;

		const index = findFeatureItemIndex(product, itemId);
		return index === -1 ? null : (product.items[index] ?? null);
	}, [draftSession, product, itemId]);
}

/** Hook to set the current item being edited. Uses context if available, otherwise Zustand. */
export function useSetCurrentItem() {
	const { product, setProduct } = useProduct();
	const { itemId, itemDraft, updateItemId } = useSheet();

	return useCallback(
		(updatedItem: ProductItem) => {
			if (itemDraft.session && itemDraft.session.itemId === itemId) {
				itemDraft.updateItem({ item: updatedItem });
				return;
			}

			if (!product?.items || !itemId) return;

			const index = findFeatureItemIndex(product, itemId);
			if (index === -1) return;

			const newItemId = getItemId({ item: updatedItem, itemIndex: index });
			if (newItemId !== itemId) updateItemId(newItemId);

			const updatedItems = [...product.items];
			updatedItems[index] = updatedItem;
			setProduct({ ...product, items: updatedItems });
		},
		[itemDraft, itemId, product, setProduct, updateItemId],
	);
}

/** Hook to check if the current item has unsaved changes. Uses context if available, otherwise Zustand. */
export function useHasItemChanges() {
	const item = useCurrentItem();
	const { initialItem, itemDraft } = useSheet();
	const { features = [] } = useFeaturesQuery();

	return useMemo(() => {
		const session = itemDraft.session;
		const item1 = session ? session.draftItem : item;
		const item2 = session ? session.initialItem : initialItem;

		if (!item1 || !item2) return false;

		const { same } = itemsAreSame({ item1, item2, features });
		return !same;
	}, [itemDraft.session, item, initialItem, features]);
}

interface PlanSheetState {
	hasChanges: boolean;
	discard: () => void;
}

/**
 * Drives a plan-level sheet's change tracking: snapshots the product when the
 * sheet opens (keyed to its type, so it re-snapshots per sheet and clears on
 * close), reports whether it has been edited since, and reverts to the snapshot
 * on discard. Host agnostic across the Zustand and context editor flows.
 */
export function usePlanSheet(sheetType: string | null): PlanSheetState {
	const { product, setProduct } = useProduct();
	const initialProduct = useSheetStore((s) => s.initialProduct);
	const setInitialProduct = useSheetStore((s) => s.setInitialProduct);
	const { features = [] } = useFeaturesQuery();

	const productRef = useRef(product);
	productRef.current = product;

	useEffect(() => {
		if (!sheetType) return;
		setInitialProduct(structuredClone(productRef.current));
		return () => setInitialProduct(null);
	}, [sheetType, setInitialProduct]);

	const hasChanges = useMemo(() => {
		if (!initialProduct) return false;

		const {
			itemsSame,
			freeTrialsSame,
			detailsSame,
			configSame,
			optionsSame,
			billingControlsSame,
		} = compareProducts(product, initialProduct, features);

		return !(
			itemsSame &&
			freeTrialsSame &&
			detailsSame &&
			configSame &&
			optionsSame &&
			billingControlsSame
		);
	}, [product, initialProduct, features]);

	const discard = useCallback(() => {
		if (!initialProduct) return;
		setProduct(structuredClone(initialProduct));
	}, [initialProduct, setProduct]);

	return { hasChanges, discard };
}

/** Hook to check if the product has unsaved changes compared to initial state. Only works in context mode. */
export function useHasPlanChanges() {
	const context = useContext(ProductContext);
	const { product, initialProduct } = useProduct();
	const { features = [] } = useFeaturesQuery();

	return useMemo(() => {
		if (context?.itemDraft.enabled) {
			return context.itemDraft.isDirtySupported;
		}

		if (!initialProduct) return false;

		const { itemsSame, freeTrialsSame } = compareProducts(
			product,
			initialProduct,
			features,
		);

		const versionsSame = product.version === initialProduct.version;

		return !(itemsSame && freeTrialsSame && versionsSame);
	}, [context?.itemDraft, product, initialProduct, features]);
}
