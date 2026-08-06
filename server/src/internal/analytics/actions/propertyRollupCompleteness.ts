// events_property_mv's insert-time gate drops high-entropy values (UUIDs, long
// hex, 32+ char opaque ids) so per-event-unique keys can't explode the rollup.
import type { AggregateGroupablePipeRow } from "@/external/tinybird/pipes/aggregateGroupablePipe.js";

export type EventTotals = Record<string, { count: number; sum: number }>;

// Sums are Float64 through two different aggregation paths, so exact equality
// would report phantom shortfalls on large values.
const RELATIVE_TOLERANCE = 1e-9;
const ABSOLUTE_TOLERANCE = 1e-6;

const isMateriallyLessThan = ({
	value,
	reference,
}: {
	value: number;
	reference: number;
}): boolean =>
	reference - value >
	Math.max(ABSOLUTE_TOLERANCE, Math.abs(reference) * RELATIVE_TOLERANCE);

export const sumGroupedRowsByEventName = ({
	rows,
}: {
	rows: AggregateGroupablePipeRow[];
}): Record<string, number> => {
	const sums: Record<string, number> = {};
	for (const row of rows) {
		sums[row.event_name] = (sums[row.event_name] ?? 0) + row.total_value;
	}
	return sums;
};

export const sumAllRows = ({
	rows,
}: {
	rows: AggregateGroupablePipeRow[];
}): number => rows.reduce((sum, row) => sum + row.total_value, 0);

// Event counts can't cancel the way signed values can, but older deployments of
// the pipe don't return them, so every count check stays opt-in.
const countRowsByEventName = ({
	rows,
}: {
	rows: AggregateGroupablePipeRow[];
}): Record<string, number> | null => {
	const counts: Record<string, number> = {};
	for (const row of rows) {
		if (row.event_count === undefined) return null;
		counts[row.event_name] = (counts[row.event_name] ?? 0) + row.event_count;
	}
	return counts;
};

export const propertyRollupCoverageIsIncomplete = ({
	rows,
	coverage,
}: {
	rows: AggregateGroupablePipeRow[];
	coverage: Record<string, number>;
}): boolean => {
	const groupedCounts = countRowsByEventName({ rows });
	if (!groupedCounts) return false;

	return Object.entries(coverage).some(
		([eventName, propertyEventCount]) =>
			(groupedCounts[eventName] ?? 0) < propertyEventCount,
	);
};

const totalEventCount = ({
	rows,
}: {
	rows: AggregateGroupablePipeRow[];
}): number | null => {
	let total = 0;
	for (const row of rows) {
		if (row.event_count === undefined) return null;
		total += row.event_count;
	}
	return total;
};

/**
 * Whether the retry recovered anything. Prefers event counts, since a recovered
 * group whose values cancel to zero moves the count but not the sum.
 */
export const reportsMoreThan = ({
	candidate,
	current,
}: {
	candidate: AggregateGroupablePipeRow[];
	current: AggregateGroupablePipeRow[];
}): boolean => {
	const candidateCount = totalEventCount({ rows: candidate });
	const currentCount = totalEventCount({ rows: current });
	if (candidateCount !== null && currentCount !== null) {
		if (candidateCount !== currentCount) return candidateCount > currentCount;
	}
	return sumAllRows({ rows: candidate }) > sumAllRows({ rows: current });
};

/**
 * Whether the gated property rollup under-reports against the ungated totals.
 * A key with both gate-surviving and gate-dropped values comes back non-empty
 * yet short, so emptiness alone never detects it.
 */
export const groupedResultIsIncomplete = ({
	rows,
	totals,
}: {
	rows: AggregateGroupablePipeRow[];
	totals: EventTotals;
}): boolean => {
	const groupedSums = sumGroupedRowsByEventName({ rows });
	const groupedCounts = countRowsByEventName({ rows });

	return Object.entries(totals).some(([eventName, total]) => {
		if (total.count <= 0) return false;

		// Signed values can cancel, so a matching sum does not prove the groups are
		// all present; the count catches what the sum hides.
		if (groupedCounts && (groupedCounts[eventName] ?? 0) < total.count) {
			return true;
		}

		return isMateriallyLessThan({
			value: groupedSums[eventName] ?? 0,
			reference: total.sum,
		});
	});
};
