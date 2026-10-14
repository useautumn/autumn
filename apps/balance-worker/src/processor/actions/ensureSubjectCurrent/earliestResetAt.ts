import type { SubjectState } from "@autumn/balance-engine";
import { CusProductStatus } from "@autumn/shared";

const horizons = new WeakMap<SubjectState, number | null>();

export function earliestResetAt({
	state,
}: {
	state: SubjectState;
}): number | null {
	const known = horizons.get(state);
	if (known !== undefined) return known;
	let earliest: number | null = null;
	for (const row of state.customerEntitlements) {
		if (row.next_reset_at === null) continue;
		if (earliest === null || row.next_reset_at < earliest)
			earliest = row.next_reset_at;
	}
	horizons.set(state, earliest);
	return earliest;
}

const windowHorizons = new WeakMap<SubjectState, number | null>();

const earliestWindowEndAt = ({
	state,
}: {
	state: SubjectState;
}): number | null => {
	const known = windowHorizons.get(state);
	if (known !== undefined) return known;
	let earliest: number | null = null;
	for (const usageWindow of state.usageWindows) {
		if (earliest === null || usageWindow.window_end_at < earliest)
			earliest = usageWindow.window_end_at;
	}
	windowHorizons.set(state, earliest);
	return earliest;
};

const orphanedAnchors = new WeakMap<SubjectState, boolean>();

const hasOrphanedAnchor = ({ state }: { state: SubjectState }): boolean => {
	const known = orphanedAnchors.get(state);
	if (known !== undefined) return known;
	const expiredProductIds = new Set(
		state.customerProducts
			.filter((product) => product.status === CusProductStatus.Expired)
			.map((product) => product.id),
	);
	const liveAnchorIds = new Set(
		state.customerEntitlements
			.filter(
				(row) =>
					!row.customer_product_id ||
					!expiredProductIds.has(row.customer_product_id),
			)
			.map((row) => row.id),
	);
	const orphaned = state.usageWindows.some(
		(usageWindow) =>
			usageWindow.anchor_customer_entitlement_id !== null &&
			!liveAnchorIds.has(usageWindow.anchor_customer_entitlement_id),
	);
	orphanedAnchors.set(state, orphaned);
	return orphaned;
};

export function resetMayBeDue({
	state,
	asOf,
}: {
	state: SubjectState;
	asOf: number;
}): boolean {
	const earliest = earliestResetAt({ state });
	if (earliest !== null && earliest < asOf) return true;
	const earliestWindowEnd = earliestWindowEndAt({ state });
	if (earliestWindowEnd !== null && earliestWindowEnd <= asOf) return true;
	return hasOrphanedAnchor({ state });
}
