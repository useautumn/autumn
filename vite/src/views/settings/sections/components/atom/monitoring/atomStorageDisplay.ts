import {
	type AtomMetricsRange,
	type AtomVolume,
	BYOC_CACHE_REPLICAS,
} from "@autumn/shared";
import {
	type AtomMetricsChartData,
	type AtomMetricsPlotRow,
	localOffsetMs,
} from "./atomMetricsChartData";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const GIB_BYTES = 1024 ** 3;

/** The bar width per range: wide enough to label each bar, at most 24 bars. */
export const EVICTION_BUCKETS: Record<
	AtomMetricsRange,
	{ ms: number; label: string }
> = {
	"1h": { ms: 5 * MINUTE_MS, label: "Customers evicted per 5 min" },
	"24h": { ms: HOUR_MS, label: "Customers evicted per hour" },
	"7d": { ms: DAY_MS, label: "Customers evicted per day" },
};

const gibFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const countFormat = new Intl.NumberFormat("en-US");
const compactCountFormat = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 1,
});

/** e.g. "15.2" */
const formatGib = (bytes: number) => gibFormat.format(bytes / GIB_BYTES);

/** e.g. "312", "1.2K" */
export const formatEvictionCount = (count: number | null) =>
	count === null ? "" : compactCountFormat.format(count);

/** A replica's used and total GiB and its used share; null when it reported no total. */
export const atomVolumeUsage = (volume: AtomVolume | undefined) => {
	if (!volume || volume.total_bytes <= 0) return null;
	return {
		used: formatGib(volume.used_bytes),
		total: formatGib(volume.total_bytes),
		share: volume.used_bytes / volume.total_bytes,
	};
};

/** e.g. "2 reporting", or "1 of 2 reporting" while a replica is silent. */
export const atomReplicasReporting = (reportingCount: number) =>
	reportingCount >= BYOC_CACHE_REPLICAS
		? `${reportingCount} reporting`
		: `${reportingCount} of ${BYOC_CACHE_REPLICAS} reporting`;

/** Each replica in a stable order, e.g. "Replica 1 · 15.2 / 20 GiB"; one that reported nothing says so. */
export const atomReplicaLines = (volumes: AtomVolume[]) => {
	const byReplica = [...volumes].sort((a, b) =>
		a.replica_id.localeCompare(b.replica_id),
	);
	return Array.from(
		{ length: Math.max(BYOC_CACHE_REPLICAS, byReplica.length) },
		(_, index) => {
			const usage = atomVolumeUsage(byReplica[index]);
			const reading = usage
				? `${usage.used} / ${usage.total} GiB`
				: "not reporting";
			return `Replica ${index + 1} · ${reading}`;
		},
	);
};

/** e.g. "10s ago", "3 min ago", "2h ago" */
export const formatUpdatedAgo = (ms: number) => {
	if (ms < MINUTE_MS) return `${Math.max(0, Math.floor(ms / SECOND_MS))}s ago`;
	if (ms < HOUR_MS) return `${Math.floor(ms / MINUTE_MS)} min ago`;
	return `${Math.floor(ms / HOUR_MS)}h ago`;
};

/** Every eviction the plotted periods counted. */
export const atomEvictionsTotal = (chartData: AtomMetricsChartData) =>
	chartData.rows.reduce((total, row) => total + (row.evicted ?? 0), 0);

/** e.g. "1,240 customers evicted in 24h" */
export const formatEvictionsTotal = ({
	total,
	range,
}: {
	total: number;
	range: AtomMetricsRange;
}) => {
	if (total === 0) return `No customers evicted in ${range}`;
	const noun = total === 1 ? "customer" : "customers";
	return `${countFormat.format(total)} ${noun} evicted in ${range}`;
};

/** Periods' evictions summed into local-time buckets clipped to the plotted span; a bucket with none plots nothing. */
export const atomEvictionBuckets = ({
	chartData,
	bucketMs,
}: {
	chartData: AtomMetricsChartData;
	bucketMs: number;
}): AtomMetricsPlotRow[] => {
	const [from, to] = chartData.timeAxis.domain;
	const offset = localOffsetMs(from);
	const totals = new Map<number, number>();
	for (const row of chartData.rows) {
		if (!row.evicted) continue;
		const bucket = Math.floor((row.at + offset) / bucketMs);
		totals.set(bucket, (totals.get(bucket) ?? 0) + row.evicted);
	}
	return [...totals].map(([bucket, evicted]) => {
		const at = Math.max(from, bucket * bucketMs - offset);
		const endAt = Math.min(to, (bucket + 1) * bucketMs - offset);
		return { at, endAt, x: (at + endAt) / 2, evicted };
	});
};
