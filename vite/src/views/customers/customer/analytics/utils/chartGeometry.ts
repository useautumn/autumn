import { MONTH_RANGES, type MonthRangeEnum } from "@autumn/shared";
import { type Granularity, getEffectiveBinSize } from "./intervals";

/**
 * Single source of truth for the usage chart's layout, shared between the real
 * recharts chart (EventsBarChart) and the loading skeleton (ChartSkeleton) so
 * the morph between them has zero shift.
 *
 * The values mirror what recharts reserves: the explicit BarChart `margin`, the
 * fixed `YAxis width`, the default `XAxis height`, and the `pt-3 pr-2` padding
 * applied to the BarChart element.
 */

export const CHART_MARGIN = { top: 5, right: 5, bottom: 5, left: 5 } as const;
export const Y_AXIS_WIDTH = 40;
export const X_AXIS_HEIGHT = 30;

/** `pt-3 pr-2` on the BarChart element, in pixels. */
const CHART_PAD = { top: 12, right: 8 } as const;

/** Plot insets (px) from each edge of the chart body (below the legend). */
export const LEFT_GUTTER = CHART_MARGIN.left + Y_AXIS_WIDTH;
export const TOP_INSET = CHART_MARGIN.top + CHART_PAD.top;
export const BOTTOM_INSET = X_AXIS_HEIGHT + CHART_MARGIN.bottom;
export const RIGHT_INSET = CHART_MARGIN.right + CHART_PAD.right;

/** Share of each band a bar fills, matching the mockup. */
export const BAR_WIDTH_FRACTION = 0.62;

/** recharts applies `barCategoryGap` to both sides of a bar, so halve the slack. */
export const BAR_CATEGORY_GAP = `${((1 - BAR_WIDTH_FRACTION) / 2) * 100}%`;

/** Pixel insets of the plot area from each edge of the chart body. */
export interface PlotInsets {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/** Fallback used before the real chart has been measured once. */
export const DEFAULT_PLOT_INSETS: PlotInsets = {
	left: LEFT_GUTTER,
	right: RIGHT_INSET,
	top: TOP_INSET,
	bottom: BOTTOM_INSET,
};

// recharts computes the exact gutter dynamically; the real chart measures its
// plot rect and caches it here so the skeleton (which renders before the chart)
// can mirror it exactly across loads within a session.
let cachedPlotInsets: PlotInsets | null = null;

export const getCachedPlotInsets = (): PlotInsets | null => cachedPlotInsets;

export const setCachedPlotInsets = (insets: PlotInsets): void => {
	cachedPlotInsets = insets;
};

export const plotInsetsEqual = (a: PlotInsets, b: PlotInsets): boolean =>
	a.left === b.left &&
	a.right === b.right &&
	a.top === b.top &&
	a.bottom === b.bottom;

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const MAX_BARS = 366;

const STANDARD_INTERVAL_DAYS: Record<string, number> = {
	"24h": 1,
	"7d": 7,
	"30d": 30,
	"90d": 90,
	"1bc": 30,
	"3bc": 90,
};

const NICE_STEP_FRACTIONS = [1, 2, 2.5, 5, 10];
const MAX_AXIS_INTERVALS = 4;

/** Y-axis ticks on an even, readable step (1/2/2.5/5 × 10^n) with at most
 * four intervals, so the top tick sits just above the tallest bar. */
export const niceAxisTicks = ({ max }: { max: number }): number[] => {
	if (!Number.isFinite(max) || max <= 0) return [0, 1];
	const roughStep = max / MAX_AXIS_INTERVALS;
	const magnitude = 10 ** Math.floor(Math.log10(roughStep));
	const fraction =
		NICE_STEP_FRACTIONS.find((nice) => nice * magnitude >= roughStep) ?? 10;
	const step = fraction * magnitude;
	const intervals = Math.max(1, Math.ceil(max / step));
	return Array.from({ length: intervals + 1 }, (_, i) => i * step);
};

/** Truncates a timestamp down to the start of its bin, matching the backend. */
const alignDown = ({
	ms,
	binSize,
}: {
	ms: number;
	binSize: Granularity;
}): number => {
	const date = new Date(ms);
	if (binSize === "hour") {
		date.setUTCMinutes(0, 0, 0);
	} else if (binSize === "month") {
		date.setUTCDate(1);
		date.setUTCHours(0, 0, 0, 0);
	} else if (binSize === "week") {
		// Monday-aligned, matching the backend's toStartOfWeek(..., 1).
		date.setUTCHours(0, 0, 0, 0);
		const daysSinceMonday = (date.getUTCDay() + 6) % 7;
		date.setUTCDate(date.getUTCDate() - daysSinceMonday);
	} else {
		date.setUTCHours(0, 0, 0, 0);
	}
	return date.getTime();
};

/** Start of a month range's window, mirroring the backend: month bins open on
 * the 1st so the range renders exactly `months` bars. */
const monthRangeStart = ({
	rangeEnd,
	months,
	binSize,
}: {
	rangeEnd: number;
	months: number;
	binSize: Granularity;
}): number => {
	const end = new Date(rangeEnd);
	const year = end.getUTCFullYear();
	const month = end.getUTCMonth();

	if (binSize === "month") {
		return Date.UTC(year, month - (months - 1), 1);
	}

	// Clamp the day the way date-fns `sub` does on the server: day 0 of the
	// following month is the last day of the target one.
	const lastDayOfTarget = new Date(
		Date.UTC(year, month - months + 1, 0),
	).getUTCDate();
	return Date.UTC(
		year,
		month - months,
		Math.min(end.getUTCDate(), lastDayOfTarget),
		end.getUTCHours(),
		end.getUTCMinutes(),
	);
};

interface RangeParams {
	interval: string;
	binSize: string | null;
	start: number | null;
	end: number | null;
}

/**
 * Predicts the start of every bin the backend will return, replicating its
 * `generateAllPeriods` (bin-aligned start, inclusive bins up to end). Used only
 * for the pre-data loading frames; once data arrives the real bins are used.
 */
export const predictBinStarts = ({
	interval,
	binSize,
	start,
	end,
}: RangeParams): number[] => {
	const bin = getEffectiveBinSize({ interval, binSize });
	const rangeEnd = interval === "custom" && end ? end : Date.now();
	const months = Object.hasOwn(MONTH_RANGES, interval)
		? MONTH_RANGES[interval as MonthRangeEnum]
		: undefined;
	const rangeStart =
		interval === "custom" && start
			? start
			: months !== undefined
				? monthRangeStart({ rangeEnd, months, binSize: bin })
				: rangeEnd - (STANDARD_INTERVAL_DAYS[interval] ?? 30) * MS_PER_DAY;

	const binStarts: number[] = [];
	const cursor = new Date(alignDown({ ms: rangeStart, binSize: bin }));
	while (cursor.getTime() <= rangeEnd && binStarts.length < MAX_BARS) {
		binStarts.push(cursor.getTime());
		if (bin === "month") {
			cursor.setUTCMonth(cursor.getUTCMonth() + 1);
		} else {
			const step =
				bin === "hour"
					? MS_PER_HOUR
					: bin === "week"
						? MS_PER_WEEK
						: MS_PER_DAY;
			cursor.setTime(cursor.getTime() + step);
		}
	}
	return binStarts;
};
