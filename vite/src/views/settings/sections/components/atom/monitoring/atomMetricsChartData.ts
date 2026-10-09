import type { AtomMetricsPoint, AtomMetricsRange } from "@autumn/shared";
import { format } from "date-fns";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const RANGE_AXES: Record<
	AtomMetricsRange,
	{ windowMs: number; tickStepMs: number; tickFormat: string }
> = {
	"1h": { windowMs: HOUR_MS, tickStepMs: 10 * MINUTE_MS, tickFormat: "HH:mm" },
	"24h": { windowMs: DAY_MS, tickStepMs: 3 * HOUR_MS, tickFormat: "HH:mm" },
	"7d": { windowMs: 7 * DAY_MS, tickStepMs: DAY_MS, tickFormat: "MMM d" },
};

/** One bucket from `at` to `endAt`, plotted at its midpoint `x` so a bar spans exactly its bucket. */
export type AtomMetricsRow = {
	at: number;
	endAt: number;
	x: number;
	cpu: number | null;
	memory: number | null;
	answered: number | null;
	forwarded: number | null;
	pushes: number | null;
};

export type AtomMetricsSeries = {
	key: Exclude<keyof AtomMetricsRow, "at" | "endAt" | "x">;
	label: string;
	color: string;
};

export type AtomMetricsChartData = {
	rows: AtomMetricsRow[];
	latest: AtomMetricsRow;
	timeAxis: {
		domain: [number, number];
		ticks: number[];
		formatTick: (x: number) => string;
	};
};

const localOffsetMs = (at: number) =>
	-new Date(at).getTimezoneOffset() * MINUTE_MS;

/** Ticks on round local times, e.g. every 3 hours from midnight. */
const roundLocalTicks = ({
	from,
	to,
	stepMs,
}: {
	from: number;
	to: number;
	stepMs: number;
}) => {
	const offset = localOffsetMs(from);
	const first = Math.ceil((from + offset) / stepMs) * stepMs - offset;
	const count = Math.floor((to - first) / stepMs) + 1;
	return Array.from({ length: count }, (_, index) => first + index * stepMs);
};

/** Every bucket in the range; one Atom logged nothing in stays null, so lines break and bars skip it. */
export const toAtomMetricsChartData = ({
	points,
	bucketSeconds,
	range,
	now,
}: {
	points: AtomMetricsPoint[];
	bucketSeconds: number;
	range: AtomMetricsRange;
	now: number;
}): AtomMetricsChartData | null => {
	const latestPoint = points.at(-1);
	if (!latestPoint) return null;

	const { windowMs, tickStepMs, tickFormat } = RANGE_AXES[range];
	const bucketMs = bucketSeconds * 1000;
	const bucketOf = (at: number) => Math.floor(at / bucketMs);
	const pointsByBucket = new Map(
		points.map((point) => [bucketOf(point.at), point]),
	);
	const toRow = (bucket: number): AtomMetricsRow => {
		const point = pointsByBucket.get(bucket);
		return {
			at: bucket * bucketMs,
			endAt: (bucket + 1) * bucketMs,
			x: (bucket + 0.5) * bucketMs,
			cpu: point?.cpu ?? null,
			memory: point?.memory ?? null,
			answered: point
				? point.requests_per_second - point.forwarded_per_second
				: null,
			forwarded: point?.forwarded_per_second ?? null,
			pushes: point?.pushes_per_second ?? null,
		};
	};

	const firstBucket = bucketOf(now - windowMs);
	const lastBucket = bucketOf(now);
	const from = firstBucket * bucketMs;
	const to = (lastBucket + 1) * bucketMs;
	return {
		rows: Array.from({ length: lastBucket - firstBucket + 1 }, (_, index) =>
			toRow(firstBucket + index),
		),
		latest: toRow(bucketOf(latestPoint.at)),
		timeAxis: {
			domain: [from, to],
			ticks: roundLocalTicks({ from, to, stepMs: tickStepMs }),
			formatTick: (x) => format(x, tickFormat),
		},
	};
};
