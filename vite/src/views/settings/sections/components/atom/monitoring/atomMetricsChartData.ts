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

const RANGE_AXES: Record<
	AtomMetricsRange,
	{ windowMs: number; tickStepMs: number; tickFormat: string }
> = {
	"1h": { windowMs: HOUR_MS, tickStepMs: 10 * MINUTE_MS, tickFormat: "HH:mm" },
	"24h": { windowMs: DAY_MS, tickStepMs: 3 * HOUR_MS, tickFormat: "HH:mm" },
	"7d": { windowMs: 7 * DAY_MS, tickStepMs: DAY_MS, tickFormat: "MMM d" },
};

type AtomTrafficValues = {
	answered: number | null;
	forwarded: number | null;
	pushes: number | null;
};

/** CPU and memory are averages under either statistic. */
export type AtomMetricsValues = AtomTrafficValues & {
	cpu: number | null;
	memory: number | null;
};

/** One period from `at` to `endAt`, plotted at its midpoint `x` so a bar spans exactly its period. */
export type AtomMetricsRow = AtomMetricsValues & {
	at: number;
	endAt: number;
	x: number;
	/** Both statistics' values for the hover; the row's own are the chosen statistic's. */
	statistics: Record<AtomMetricsStatistic, AtomMetricsValues>;
};

/** The latest 10s window's traffic. */
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
	/** The latest 10s window, whichever statistic is chosen. */
	now: AtomMetricsReading | null;
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

const ratesToTraffic = (
	rates: AtomMetricsRates | undefined,
): AtomTrafficValues => ({
	answered: rates ? rates.requests - rates.forwarded : null,
	forwarded: rates?.forwarded ?? null,
	pushes: rates?.pushes ?? null,
});

/** Every period in the range; one the Atom logged nothing in stays null, so lines break and bars skip it. */
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
	const latestPoint = points.at(-1);
	if (!latestPoint) return null;

	const { windowMs, tickStepMs, tickFormat } = RANGE_AXES[range];
	const periodMs = periodSeconds * 1000;
	const periodOf = (at: number) => Math.floor(at / periodMs);
	const pointsByPeriod = new Map(
		points.map((point) => [periodOf(point.at), point]),
	);
	const toRow = (period: number): AtomMetricsRow => {
		const point = pointsByPeriod.get(period);
		const utilization = {
			cpu: point?.cpu ?? null,
			memory: point?.memory ?? null,
		};
		const statistics = {
			maximum: { ...utilization, ...ratesToTraffic(point?.maximum) },
			average: { ...utilization, ...ratesToTraffic(point?.average) },
		};
		return {
			at: period * periodMs,
			endAt: (period + 1) * periodMs,
			x: (period + 0.5) * periodMs,
			...statistics[statistic],
			statistics,
		};
	};

	const firstPeriod = periodOf(fetchedAt - windowMs);
	const lastPeriod = periodOf(fetchedAt);
	const from = firstPeriod * periodMs;
	const to = (lastPeriod + 1) * periodMs;
	return {
		rows: Array.from({ length: lastPeriod - firstPeriod + 1 }, (_, index) =>
			toRow(firstPeriod + index),
		),
		latest: toRow(periodOf(latestPoint.at)),
		now: latest && { at: latest.at, ...ratesToTraffic(latest) },
		timeAxis: {
			domain: [from, to],
			ticks: roundLocalTicks({ from, to, stepMs: tickStepMs }),
			formatTick: (x) => format(x, tickFormat),
		},
	};
};
