import type { ProductItem } from "@autumn/shared";
import { useEffect, useMemo, useState } from "react";
import { outgoingToProductItems } from "../utils/attachDiffUtils";
import type { UseAttachPreviewReturn } from "./useAttachPreview";

/**
 * Derives outgoing ProductItems from preview_attach data and tracks
 * whether the diff is loading independently from the pricing preview.
 *
 * The diff only reloads when plan config changes (productId, items, version).
 * Billing param changes (schedule, proration, etc.) do not trigger diff loading.
 */
export function usePreviewDiff({
	previewQuery,
	productId,
	items,
	version,
	incomingItems,
}: {
	previewQuery: UseAttachPreviewReturn;
	productId: string;
	items: ProductItem[] | null;
	version: number | undefined;
	incomingItems: ProductItem[] | undefined;
}) {
	const planConfigKey = useMemo(
		() => JSON.stringify({ productId, items, version }),
		[productId, items, version],
	);

	const [diffState, setDiffState] = useState<{
		key: string;
		items: ProductItem[];
	}>({ key: "", items: [] });

	const outgoing = previewQuery.data?.outgoing;
	const isLoading = previewQuery.isLoading;

	useEffect(() => {
		if (!isLoading) {
			setDiffState({
				key: planConfigKey,
				items: outgoing
					? outgoingToProductItems({ outgoing, incomingItems })
					: [],
			});
		}
	}, [isLoading, outgoing, planConfigKey, incomingItems]);

	return {
		outgoingItems: diffState.items,
		isDiffLoading: diffState.key !== planConfigKey,
	};
}

export type UsePreviewDiffReturn = ReturnType<typeof usePreviewDiff>;
