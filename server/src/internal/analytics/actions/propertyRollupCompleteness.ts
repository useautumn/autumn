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

	return Object.entries(totals).some(
		([eventName, total]) =>
			total.count > 0 &&
			isMateriallyLessThan({
				value: groupedSums[eventName] ?? 0,
				reference: total.sum,
			}),
	);
};
