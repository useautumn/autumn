import type { FrontendProduct, ProductItem } from "@autumn/shared";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";
import { getItemId } from "@/utils/product/productItemUtils";

export interface DraftItemSession {
	itemId: string;
	// Resolved on session start so in-session patches write by index, not by
	// recomputing getItemId(). Without this, editing an interval mid-session
	// changes the item's id and subsequent updates silently no-op.
	itemIndex: number;
	initialItem: ProductItem;
	draftItem: ProductItem;
}

export interface SupportedCustomizationSnapshot {
	items: ProductItem[];
	version: number | undefined;
	freeTrial: {
		length: number;
		duration: string;
		cardRequired: boolean;
	} | null;
}

export interface ItemDraftController {
	enabled: boolean;
	session: DraftItemSession | null;
	initialProduct: FrontendProduct | null;
	draftProduct: FrontendProduct | null;
	supportedCustomization: SupportedCustomizationSnapshot | null;
	isDirty: boolean;
	isDirtySupported: boolean;
	start: ({ product }: { product: FrontendProduct }) => void;
	patchProduct: ({ product }: { product: FrontendProduct }) => void;
	patchItem: ({ itemId, item }: { itemId: string; item: ProductItem }) => void;
	startItem: ({ itemId, item }: { itemId: string; item: ProductItem }) => void;
	updateItem: ({ item }: { item: ProductItem }) => void;
	discardItem: () => void;
	commitItem: () => void;
	clearItemSession: () => void;
	discard: () => void;
	commit: () => void;
	clear: () => void;
}

const toSupportedCustomization = ({
	product,
}: {
	product: FrontendProduct;
}): SupportedCustomizationSnapshot => {
	const freeTrial = product.free_trial
		? {
				length: Number(product.free_trial.length),
				duration: String(product.free_trial.duration),
				cardRequired: Boolean(product.free_trial.card_required),
			}
		: null;

	return {
		items: structuredClone(product.items ?? []),
		version: product.version,
		freeTrial,
	};
};

const areEqual = ({ left, right }: { left: unknown; right: unknown }) => {
	return JSON.stringify(left) === JSON.stringify(right);
};

const patchItemOnProduct = ({
	product,
	itemId,
	itemIndex: knownIndex,
	item,
}: {
	product: FrontendProduct;
	itemId: string;
	// When provided, write directly to this index instead of re-deriving it
	// from getItemId(). Required for edits that mutate id-affecting fields
	// (e.g. interval), since the recomputed id no longer matches itemId.
	itemIndex?: number;
	item: ProductItem;
}): FrontendProduct => {
	if (!product.items?.length) return product;

	const itemIndex =
		knownIndex !== undefined && knownIndex >= 0 && knownIndex < product.items.length
			? knownIndex
			: product.items.findIndex((currentItem, i) => {
					const currentItemId = getItemId({ item: currentItem, itemIndex: i });
					return currentItemId === itemId;
				});

	if (itemIndex === -1) return product;

	const updatedItems = [...product.items];
	updatedItems[itemIndex] = item;

	return {
		...product,
		items: updatedItems,
	};
};

export const disabledItemDraftController: ItemDraftController = {
	enabled: false,
	session: null,
	initialProduct: null,
	draftProduct: null,
	supportedCustomization: null,
	isDirty: false,
	isDirtySupported: false,
	start: (_params) => {},
	patchProduct: (_params) => {},
	patchItem: (_params) => {},
	startItem: (_params) => {},
	updateItem: (_params) => {},
	discardItem: () => {},
	commitItem: () => {},
	clearItemSession: () => {},
	discard: () => {},
	commit: () => {},
	clear: () => {},
};

export const useItemDraftController = ({
	initialProduct: initialPlanProduct,
	setInitialItemState,
}: {
	initialProduct?: FrontendProduct;
	setInitialItemState: Dispatch<SetStateAction<ProductItem | null>>;
}): ItemDraftController => {
	const [draftItemSession, setDraftItemSession] =
		useState<DraftItemSession | null>(null);
	const [initialProduct, setInitialProduct] = useState<FrontendProduct | null>(
		initialPlanProduct ? structuredClone(initialPlanProduct) : null,
	);
	const [draftProduct, setDraftProduct] = useState<FrontendProduct | null>(
		initialPlanProduct ? structuredClone(initialPlanProduct) : null,
	);

	const clearItemSession = useCallback(() => {
		setDraftItemSession(null);
		setInitialItemState(null);
	}, [setInitialItemState]);

	const startPlanDraft = useCallback(
		({ product }: { product: FrontendProduct }) => {
			const clonedProduct = structuredClone(product);
			setInitialProduct(clonedProduct);
			setDraftProduct(clonedProduct);
			setDraftItemSession(null);
			setInitialItemState(null);
		},
		[setInitialItemState],
	);

	const patchPlanProduct = useCallback(
		({ product }: { product: FrontendProduct }) => {
			setDraftProduct(structuredClone(product));
		},
		[],
	);

	const patchPlanItem = useCallback(
		({
			itemId,
			itemIndex,
			item,
		}: {
			itemId: string;
			itemIndex?: number;
			item: ProductItem;
		}) => {
			setDraftProduct((previousProduct) => {
				if (!previousProduct) return previousProduct;
				return patchItemOnProduct({
					product: previousProduct,
					itemId,
					itemIndex,
					item,
				});
			});
		},
		[],
	);

	const startItemDraft = useCallback(
		({ itemId, item }: { itemId: string; item: ProductItem }) => {
			const clonedItem = structuredClone(item);
			const resolvedIndex =
				draftProduct?.items?.findIndex((candidate, i) => {
					return getItemId({ item: candidate, itemIndex: i }) === itemId;
				}) ?? -1;
			setDraftItemSession({
				itemId,
				itemIndex: resolvedIndex,
				initialItem: clonedItem,
				draftItem: clonedItem,
			});
			setInitialItemState(clonedItem);
		},
		[draftProduct, setInitialItemState],
	);

	const updateItemDraft = useCallback(
		({ item }: { item: ProductItem }) => {
			setDraftItemSession((prev) => {
				if (!prev) return prev;
				patchPlanItem({
					itemId: prev.itemId,
					itemIndex: prev.itemIndex,
					item,
				});
				return {
					...prev,
					draftItem: item,
				};
			});
		},
		[patchPlanItem],
	);

	const discardItemDraft = useCallback(() => {
		setDraftItemSession((prev) => {
			if (!prev) return prev;
			const restoredItem = structuredClone(prev.initialItem);
			setInitialItemState(restoredItem);
			patchPlanItem({
				itemId: prev.itemId,
				itemIndex: prev.itemIndex,
				item: restoredItem,
			});
			return {
				...prev,
				draftItem: restoredItem,
			};
		});
	}, [setInitialItemState, patchPlanItem]);

	const commitItemDraft = useCallback(() => {
		setDraftItemSession((session) => {
			if (!session) return session;

			patchPlanItem({
				itemId: session.itemId,
				itemIndex: session.itemIndex,
				item: session.draftItem,
			});

			const committedItem = structuredClone(session.draftItem);
			setInitialItemState(committedItem);

			return {
				...session,
				initialItem: committedItem,
				draftItem: committedItem,
			};
		});
	}, [patchPlanItem, setInitialItemState]);

	const discardPlanDraft = useCallback(() => {
		if (!initialProduct) return;
		setDraftProduct(structuredClone(initialProduct));
		clearItemSession();
	}, [clearItemSession, initialProduct]);

	const commitPlanDraft = useCallback(() => {
		if (!draftProduct) return;
		const clonedProduct = structuredClone(draftProduct);
		setInitialProduct(clonedProduct);
		setDraftProduct(clonedProduct);
		clearItemSession();
	}, [clearItemSession, draftProduct]);

	const clearPlanDraft = useCallback(() => {
		setInitialProduct(null);
		setDraftProduct(null);
		clearItemSession();
	}, [clearItemSession]);

	const supportedCustomization = useMemo(() => {
		if (!draftProduct) return null;
		return toSupportedCustomization({ product: draftProduct });
	}, [draftProduct]);

	const isDirty = useMemo(() => {
		if (!initialProduct || !draftProduct) return false;
		return !areEqual({ left: initialProduct, right: draftProduct });
	}, [initialProduct, draftProduct]);

	const isDirtySupported = useMemo(() => {
		if (!initialProduct || !draftProduct) return false;

		const initialCustomization = toSupportedCustomization({
			product: initialProduct,
		});
		const draftCustomization = toSupportedCustomization({
			product: draftProduct,
		});

		return !areEqual({
			left: initialCustomization,
			right: draftCustomization,
		});
	}, [initialProduct, draftProduct]);

	return {
		enabled: true,
		session: draftItemSession,
		initialProduct,
		draftProduct,
		supportedCustomization,
		isDirty,
		isDirtySupported,
		start: startPlanDraft,
		patchProduct: patchPlanProduct,
		patchItem: patchPlanItem,
		startItem: startItemDraft,
		updateItem: updateItemDraft,
		discardItem: discardItemDraft,
		commitItem: commitItemDraft,
		clearItemSession,
		discard: discardPlanDraft,
		commit: commitPlanDraft,
		clear: clearPlanDraft,
	};
};
