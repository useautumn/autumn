import type { SubjectState } from "@autumn/balance-engine";
import { CusProductStatus } from "@autumn/shared";

/**
 * The earliest moment anything in a state can fall due for a reset: the
 * smallest `next_reset_at` among its entitlement rows, or null when no row
 * has a cycle end. A reset refills rows whose cycle ended strictly before
 * the command's clock, so a command at or before this moment finds nothing
 * due and needs no reset decision at all.
 *
 * States are replaced, never edited, so the bound is computed once per state
 * object. Every check and track used to read the full subject and scan it
 * for due rows first, ~12% of a pinned worker's thread for an answer that
 * was almost always "nothing".
 */
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

/** The earliest a usage-window counter's window closes, or null when the state has none; cached per state like the reset horizon. */
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

/** A counter whose anchor row left the subject or ended with its plan: a plan change the roll re-points. */
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

/** Whether a reset decided at `asOf` could refill a row or roll a usage-window counter in this state. */
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
