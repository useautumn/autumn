import { MONTH_RANGES, type MonthRangeEnum } from "@autumn/shared";
import { type Granularity, getEffectiveBinSize } from "./intervals";

/** The usage chart's layout, read by UsageChartFrame (chart and skeleton) and the loading stubs.
 * Spacing lives in the margin, never in CSS padding on the svg, which would scale it off whole pixels. */

export const CHART_MARGIN = { top: 17, right: 13, bottom: 5, left: 5 } as const;
export const Y_AXIS_WIDTH = 40;
export const X_AXIS_HEIGHT = 30;

/** Plot insets (px) from each edge of the chart box; the loading stubs sit on its bottom edge. */
export const PLOT_INSETS = {
	left: CHART_MARGIN.left + Y_AXIS_WIDTH,
	right: CHART_MARGIN.right,
	top: CHART_MARGIN.top,
	bottom: X_AXIS_HEIGHT + CHART_MARGIN.bottom,
} as const;

/** Past this many bins a 4px gap would eat most of each slot, so the gap turns proportional. */
const DENSE_BAR_COUNT = 120;
/** Past this many bins a bar is only a few pixels wide, so a segment gap would hide it. */
const NO_SEGMENT_GAP_BAR_COUNT = 90;
const BUSY_SERIES_COUNT = 20;

/**
 * Bar layout shared by the chart and its loading stubs. `categoryGap` feeds recharts (both sides of
 * a bar) and `segmentGap` its background stroke; `fillInset`/`fillWidth` place, within one bin's
 * slot, exactly the fill recharts paints: its rounded width, less half the stroke on each side.
 */
export const barLayout = ({
	barCount,
	seriesCount,
}: {
	barCount: number;
	seriesCount: number;
}) => {
	const segmentGap =
		barCount > NO_SEGMENT_GAP_BAR_COUNT
			? 0
			: seriesCount >= BUSY_SERIES_COUNT
				? 1
				: 2;
	if (barCount > DENSE_BAR_COUNT) {
		return {
			categoryGap: "10%",
			segmentGap,
			fillInset: "10%",
			fillWidth: "round(80%, 1px)",
		};
	}
	return {
		categoryGap: 2,
		segmentGap,
		fillInset: `${2 + segmentGap / 2}px`,
		fillWidth: `calc(round(100% - 4px, 1px) - ${segmentGap}px)`,
	};
};

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

/** Before data lands, the skeleton draws the gridlines a full four-interval axis would. */
export const SKELETON_Y_TICKS = Array.from(
	{ length: MAX_AXIS_INTERVALS + 1 },
	(_, i) => i,
);

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
