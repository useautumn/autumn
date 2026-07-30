import type { ProductItem } from "@autumn/shared";
import { useEffect, useMemo, useState } from "react";
import type { VersionedPlanLicense } from "@/hooks/queries/usePlanLicensesQuery";
import {
	outgoingToPlanLicenses,
	outgoingToProductItems,
} from "../utils/attachDiffUtils";
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
	enabled = true,
}: {
	previewQuery: UseAttachPreviewReturn;
	productId: string;
	items: ProductItem[] | null;
	version: number | undefined;
	incomingItems: ProductItem[] | undefined;
	enabled?: boolean;
}) {
	const planConfigKey = useMemo(
		() => JSON.stringify({ productId, items, version }),
		[productId, items, version],
	);

	const [diffState, setDiffState] = useState<{
		key: string;
		items: ProductItem[];
		licenses: VersionedPlanLicense[];
		hasOutgoing: boolean;
	}>({ key: "", items: [], licenses: [], hasOutgoing: false });

	const outgoing = previewQuery.data?.outgoing;
	const isLoading = previewQuery.isLoading;

	useEffect(() => {
		if (enabled && !isLoading) {
			setDiffState({
				key: planConfigKey,
				items: outgoing
					? outgoingToProductItems({ outgoing, incomingItems })
					: [],
				licenses: outgoingToPlanLicenses({ outgoing }),
				hasOutgoing: (outgoing?.length ?? 0) > 0,
			});
		}
	}, [enabled, isLoading, outgoing, planConfigKey, incomingItems]);

	if (!enabled) {
		return {
			outgoingItems: [],
			outgoingLicenses: [],
			hasOutgoingPlans: false,
			isDiffLoading: false,
		};
	}

	return {
		outgoingItems: diffState.items,
		outgoingLicenses: diffState.licenses,
		hasOutgoingPlans: diffState.hasOutgoing,
		isDiffLoading: diffState.key !== planConfigKey,
	};
}

export type UsePreviewDiffReturn = ReturnType<typeof usePreviewDiff>;
