import type { SubjectState } from "@autumn/balance-engine";

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

/** Whether a reset decided at `asOf` could refill anything in this state. */
export function resetMayBeDue({
	state,
	asOf,
}: {
	state: SubjectState;
	asOf: number;
}): boolean {
	const earliest = earliestResetAt({ state });
	return earliest !== null && earliest < asOf;
}
