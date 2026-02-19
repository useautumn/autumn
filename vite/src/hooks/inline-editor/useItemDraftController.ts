import type { FrontendProduct, ProductItem } from "@autumn/shared";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";
import { getItemId } from "@/utils/product/productItemUtils";

export interface DraftItemSession {
	itemId: string;
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
	item,
}: {
	product: FrontendProduct;
	itemId: string;
	item: ProductItem;
}): FrontendProduct => {
	if (!product.items?.length) return product;

	const itemIndex = product.items.findIndex((currentItem, itemIndex) => {
		const currentItemId = getItemId({ item: currentItem, itemIndex });
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
		({ itemId, item }: { itemId: string; item: ProductItem }) => {
			setDraftProduct((previousProduct) => {
				if (!previousProduct) return previousProduct;
				return patchItemOnProduct({
					product: previousProduct,
					itemId,
					item,
				});
			});
		},
		[],
	);

	const startItemDraft = useCallback(
		({ itemId, item }: { itemId: string; item: ProductItem }) => {
			const clonedItem = structuredClone(item);
			setDraftItemSession({
				itemId,
				initialItem: clonedItem,
				draftItem: clonedItem,
			});
			setInitialItemState(clonedItem);
		},
		[setInitialItemState],
	);

	const updateItemDraft = useCallback(
		({ item }: { item: ProductItem }) => {
			setDraftItemSession((prev) => {
				if (!prev) return prev;
				patchPlanItem({ itemId: prev.itemId, item });
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
			patchPlanItem({ itemId: prev.itemId, item: restoredItem });
			return {
				...prev,
				draftItem: restoredItem,
			};
		});
	}, [setInitialItemState, patchPlanItem]);

	const commitItemDraft = useCallback(() => {
		setDraftItemSession((session) => {
			if (!session) return session;

			patchPlanItem({ itemId: session.itemId, item: session.draftItem });

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
