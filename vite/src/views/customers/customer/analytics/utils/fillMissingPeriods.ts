import type { EventRow, EventsData } from "../components/analytics-types";

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

export function fillMissingPeriods({
	events,
	periods,
}: {
	events: EventsData;
	periods: string[];
}): EventsData {
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
