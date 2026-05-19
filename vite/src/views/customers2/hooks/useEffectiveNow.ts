import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useViewAsStore } from "@/hooks/stores/useViewAsStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

/**
 * Returns the effective "now" timestamp (ms) for the customer view.
 * Precedence: view-as `asOfMs` > test-clock frozen time > `Date.now()`.
 */
export function useEffectiveNow(): number {
	const asOfMs = useViewAsStore((s) => s.asOfMs);
	const { testClockFrozenTimeMs } = useCusQuery();
	return asOfMs ?? testClockFrozenTimeMs ?? Date.now();
}

/** True iff the customer is being viewed at a past, pinned date. */
export function useIsViewingAsPast(): boolean {
	return useViewAsStore((s) => s.asOfMs != null);
}

/**
 * Effective entity scope. In view-as mode, the pinned entity overrides the URL
 * `?entity_id` so the pinned product is never dropped by entity filters.
 */
export function useEffectiveEntityId(): string | null {
	const isViewAs = useIsViewingAsPast();
	const pinnedEntityId = useViewAsStore((s) => s.entityId);
	const { entityId } = useEntity();
	return isViewAs ? pinnedEntityId : entityId;
}
