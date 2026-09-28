import type { EventRow, EventsData } from "../components/analytics-types";

/** The last bucket starting at or before `period`, or the first bucket. */
const bucketFor = ({
	period,
	buckets,
}: {
	period: string;
	buckets: string[];
}): string => {
	let match = buckets[0];
	for (const bucket of buckets) {
		if (bucket > period) break;
		match = bucket;
	}
	return match;
};

/**
 * Lays `events` onto exactly the given `periods`: every bucket gets a row
 * (zero-filled when idle), and a row stamped between buckets — e.g. a period
 * string in another zone — folds into the bucket it falls in rather than adding
 * a slot, which would squeeze every bar.
 */
export function fillMissingPeriods({
	events,
	periods,
}: {
	events: EventsData;
	periods: string[];
}): EventsData {
	// Period strings are "yyyy-MM-dd HH:mm:ss", so lexical order is chronological.
	const buckets = [...new Set(periods)].sort();
	if (buckets.length === 0) return events;

	const seriesColumns = events.meta
		.filter(({ name }) => name !== "period")
		.map(({ name }) => name);

	const rowByBucket = new Map<string, EventRow>();
	for (const bucket of buckets) {
		const zeroRow: EventRow = { period: bucket };
		for (const column of seriesColumns) zeroRow[column] = 0;
		rowByBucket.set(bucket, zeroRow);
	}

	for (const row of events.data) {
		const bucket = bucketFor({ period: String(row.period), buckets });
		const target = rowByBucket.get(bucket);
		if (!target) continue;
		for (const column of seriesColumns) {
			target[column] = Number(target[column] ?? 0) + Number(row[column] ?? 0);
		}
	}

	const data = buckets.map((bucket) => rowByBucket.get(bucket) as EventRow);
	return { ...events, rows: data.length, data };
}
