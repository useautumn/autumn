import type { EventRow, EventsData } from "../components/analytics-types";

/**
 * Adds an all-zero row for every period in `periods` the data is missing, so a
 * bucket with no usage still gets an x-axis slot. Rows outside `periods` are kept.
 */
export function fillMissingPeriods({
	events,
	periods,
}: {
	events: EventsData;
	periods: string[];
}): EventsData {
	const seriesColumns = events.meta
		.filter(({ name }) => name !== "period")
		.map(({ name }) => name);

	const rowByPeriod = new Map<string, EventRow>();
	for (const row of events.data) rowByPeriod.set(String(row.period), row);

	let added = 0;
	for (const period of periods) {
		if (rowByPeriod.has(period)) continue;
		const zeroRow: EventRow = { period };
		for (const column of seriesColumns) zeroRow[column] = 0;
		rowByPeriod.set(period, zeroRow);
		added++;
	}

	if (added === 0) return events;

	// Period strings are "yyyy-MM-dd HH:mm:ss", so lexical order is chronological.
	const data = [...rowByPeriod.values()].sort((a, b) =>
		String(a.period).localeCompare(String(b.period)),
	);

	return { ...events, rows: data.length, data };
}
