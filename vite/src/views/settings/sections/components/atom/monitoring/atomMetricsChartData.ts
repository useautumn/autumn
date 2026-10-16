import type {
	AtomMetricsLatest,
	AtomMetricsPoint,
	AtomMetricsRange,
	AtomMetricsRates,
	AtomMetricsStatistic,
} from "@autumn/shared";
import { format } from "date-fns";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const RANGE_WINDOW_MS: Record<AtomMetricsRange, number> = {
	"1h": HOUR_MS,
	"24h": DAY_MS,
	"7d": 7 * DAY_MS,
};

const TICK_STEPS_MS = [
	MINUTE_MS,
	2 * MINUTE_MS,
	5 * MINUTE_MS,
	10 * MINUTE_MS,
	15 * MINUTE_MS,
	30 * MINUTE_MS,
	HOUR_MS,
	3 * HOUR_MS,
	6 * HOUR_MS,
	12 * HOUR_MS,
	DAY_MS,
];
const MAX_TICKS = 6;

/** The finest round step that labels the span in at most six ticks. */
const tickStepFor = (spanMs: number) =>
	TICK_STEPS_MS.find((stepMs) => spanMs / stepMs <= MAX_TICKS) ?? DAY_MS;

type AtomTrafficValues = {
	answered: number | null;
	forwarded: number | null;
	pushes: number | null;
};

/** CPU and memory are averages under either statistic; disk and evictions are the same under both. */
export type AtomMetricsValues = AtomTrafficValues & {
	cpu: number | null;
	memory: number | null;
	disk: number | null;
	evicted: number | null;
};

/** A span on the time axis, plotted at its midpoint `x`, and whichever values it has. */
export type AtomMetricsPlotRow = {
	at: number;
	endAt: number;
	x: number;
} & Partial<AtomMetricsValues>;

/** One period from `at` to `endAt`, plotted at its midpoint `x` so a bar spans exactly its period. */
export type AtomMetricsRow = AtomMetricsPlotRow &
	AtomMetricsValues & {
		/** Both statistics' values for the hover; the row's own are the chosen statistic's. */
		statistics: Record<AtomMetricsStatistic, AtomMetricsValues>;
	};

/** The last minute's traffic. */
export type AtomMetricsReading = AtomTrafficValues & { at: number };

export type AtomMetricsSeries = {
	key: keyof AtomMetricsValues;
	label: string;
	color: string;
};

export type AtomMetricsChartData = {
	rows: AtomMetricsRow[];
	/** The latest period. */
	latest: AtomMetricsRow;
	/** The last minute, whichever statistic is chosen. */
	now: AtomMetricsReading | null;
	timeAxis: {
		domain: [number, number];
		ticks: number[];
		formatTick: (x: number) => string;
	};
	/** When the last period with any requests ended; null when none in the plotted span. */
	lastTrafficAt: number | null;
};

export const localOffsetMs = (at: number) =>
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

const ratesToTraffic = (
	rates: AtomMetricsRates | undefined,
): AtomTrafficValues => ({
	answered: rates ? rates.requests - rates.forwarded : null,
	forwarded: rates?.forwarded ?? null,
	pushes: rates?.pushes ?? null,
});

export const requestsOf = (
	values: Pick<AtomMetricsValues, "answered" | "forwarded">,
) => (values.answered ?? 0) + (values.forwarded ?? 0);

const hasRequests = (row: AtomMetricsRow) => requestsOf(row) > 0;

/** Every period from the range's start, or the Atom's first period if later; one it logged nothing in stays null, so lines break. */
export const toAtomMetricsChartData = ({
	points,
	latest,
	periodSeconds,
	range,
	statistic,
	fetchedAt,
}: {
	points: AtomMetricsPoint[];
	latest: AtomMetricsLatest | null;
	periodSeconds: number;
	range: AtomMetricsRange;
	statistic: AtomMetricsStatistic;
	fetchedAt: number;
}): AtomMetricsChartData | null => {
	const firstPoint = points[0];
	const latestPoint = points.at(-1);
	if (!firstPoint || !latestPoint) return null;

	const periodMs = periodSeconds * 1000;
	const periodOf = (at: number) => Math.floor(at / periodMs);
	const pointsByPeriod = new Map(
		points.map((point) => [periodOf(point.at), point]),
	);
	const toRow = (period: number): AtomMetricsRow => {
		const point = pointsByPeriod.get(period);
		const unsplit = {
			cpu: point?.cpu ?? null,
			memory: point?.memory ?? null,
			disk: point?.disk ?? null,
			evicted: point?.evicted ?? null,
		};
		const statistics = {
			maximum: { ...unsplit, ...ratesToTraffic(point?.maximum) },
			average: { ...unsplit, ...ratesToTraffic(point?.average) },
		};
		return {
			at: period * periodMs,
			endAt: (period + 1) * periodMs,
			x: (period + 0.5) * periodMs,
			...statistics[statistic],
			statistics,
		};
	};

	const firstPeriod = Math.max(
		periodOf(fetchedAt - RANGE_WINDOW_MS[range]),
		periodOf(firstPoint.at),
	);
	const lastPeriod = periodOf(fetchedAt);
	const from = firstPeriod * periodMs;
	const to = (lastPeriod + 1) * periodMs;
	const rows = Array.from(
		{ length: lastPeriod - firstPeriod + 1 },
		(_, index) => toRow(firstPeriod + index),
	);
	const tickStepMs = tickStepFor(to - from);
	return {
		rows,
		latest: toRow(periodOf(latestPoint.at)),
		now: latest && { at: latest.at, ...ratesToTraffic(latest) },
		timeAxis: {
			domain: [from, to],
			ticks: roundLocalTicks({ from, to, stepMs: tickStepMs }),
			formatTick: (x) => format(x, tickStepMs < DAY_MS ? "HH:mm" : "MMM d"),
		},
		lastTrafficAt: rows.filter(hasRequests).at(-1)?.endAt ?? null,
	};
};
