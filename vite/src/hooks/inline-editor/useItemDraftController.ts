import type { FrontendProduct, ProductItem } from "@autumn/shared";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";
import { getItemId } from "@/utils/product/productItemUtils";

export interface DraftItemSession {
	itemId: string;
	initialItem: ProductItem;
	draftItem: ProductItem;
}

export interface ItemDraftController {
	enabled: boolean;
	session: DraftItemSession | null;
	start: ({ itemId, item }: { itemId: string; item: ProductItem }) => void;
	update: ({ item }: { item: ProductItem }) => void;
	discard: () => void;
	commit: () => void;
	clear: () => void;
}

export const disabledItemDraftController: ItemDraftController = {
	enabled: false,
	session: null,
	start: (_params) => {},
	update: (_params) => {},
	discard: () => {},
	commit: () => {},
	clear: () => {},
};

export const useItemDraftController = ({
	setProduct,
	setInitialItemState,
}: {
	setProduct: Dispatch<SetStateAction<FrontendProduct>>;
	setInitialItemState: Dispatch<SetStateAction<ProductItem | null>>;
}): ItemDraftController => {
	const [draftItemSession, setDraftItemSession] =
		useState<DraftItemSession | null>(null);

	const clearItemDraft = useCallback(() => {
		setDraftItemSession(null);
		setInitialItemState(null);
	}, [setInitialItemState]);

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

	const updateItemDraft = useCallback(({ item }: { item: ProductItem }) => {
		setDraftItemSession((prev) => {
			if (!prev) return prev;
			return {
				...prev,
				draftItem: item,
			};
		});
	}, []);

	const discardItemDraft = useCallback(() => {
		setDraftItemSession((prev) => {
			if (!prev) return prev;
			const restoredItem = structuredClone(prev.initialItem);
			setInitialItemState(restoredItem);
			return {
				...prev,
				draftItem: restoredItem,
			};
		});
	}, [setInitialItemState]);

	const commitItemDraft = useCallback(() => {
		setDraftItemSession((session) => {
			if (!session) return session;

			setProduct((prevProduct) => {
				if (!prevProduct.items?.length) return prevProduct;

				const itemIndex = prevProduct.items.findIndex((item, index) => {
					const currentItemId = getItemId({ item, itemIndex: index });
					return currentItemId === session.itemId;
				});

				if (itemIndex === -1) return prevProduct;

				const updatedItems = [...prevProduct.items];
				updatedItems[itemIndex] = session.draftItem;

				return {
					...prevProduct,
					items: updatedItems,
				};
			});

			const committedItem = structuredClone(session.draftItem);
			setInitialItemState(committedItem);

			return {
				...session,
				initialItem: committedItem,
				draftItem: committedItem,
			};
		});
	}, [setProduct, setInitialItemState]);

	return useMemo(
		() => ({
			enabled: true,
			session: draftItemSession,
			start: startItemDraft,
			update: updateItemDraft,
			discard: discardItemDraft,
			commit: commitItemDraft,
			clear: clearItemDraft,
		}),
		[
			draftItemSession,
			startItemDraft,
			updateItemDraft,
			discardItemDraft,
			commitItemDraft,
			clearItemDraft,
		],
	);
};
