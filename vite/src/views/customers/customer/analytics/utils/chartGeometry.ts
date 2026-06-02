import type { CSSProperties } from "react";

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

/** `barCategoryGap="10%"` on the BarChart: bar = 90% of the band, centered. */
export const BAR_CATEGORY_GAP = 0.1;

/**
 * CSS grid styles that reproduce recharts' band layout: each bar is 90% of its
 * band with 5% outer padding and 10% inter-bar gaps. Percentages resolve
 * against the plot width, so no width measurement is needed.
 */
export const bandGridStyle = (count: number): CSSProperties => ({
	display: "grid",
	gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
	columnGap: `${(BAR_CATEGORY_GAP * 100) / count}%`,
	paddingInline: `${(BAR_CATEGORY_GAP * 50) / count}%`,
	alignItems: "end",
});

/** Per-bar geometry + timing for the loading wave. Heights are a scaleY
 * fraction (0-1) of the full plot height. */
export interface SkeletonBarConfig {
	peak: number;
	low: number;
	duration: number;
	delay: number;
}

/** Randomised, stable bar configs for the loading wave. */
export const buildSkeletonBars = (count: number): SkeletonBarConfig[] =>
	Array.from({ length: count }, () => {
		const peak = 0.22 + Math.random() * 0.73;
		return {
			peak,
			low: peak * (0.35 + Math.random() * 0.2),
			duration: 2.6 + Math.random() * 1.8,
			delay: Math.random() * 1.4,
		};
	});

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
const MIN_BARS = 6;
const MAX_BARS = 366;

const STANDARD_INTERVAL_DAYS: Record<string, number> = {
	"24h": 1,
	"7d": 7,
	"30d": 30,
	"90d": 90,
	"1bc": 30,
	"3bc": 90,
};

type BinSize = "hour" | "day" | "month";

const resolveBinSize = ({
	interval,
	binSize,
}: {
	interval: string;
	binSize: string | null;
}): BinSize => {
	if (binSize === "hour" || binSize === "day" || binSize === "month") {
		return binSize;
	}
	return interval === "24h" ? "hour" : "day";
};

/** Truncates a timestamp down to the start of its bin, matching the backend. */
const alignDown = ({ ms, binSize }: { ms: number; binSize: BinSize }): number => {
	const date = new Date(ms);
	if (binSize === "hour") {
		date.setUTCMinutes(0, 0, 0);
	} else if (binSize === "month") {
		date.setUTCDate(1);
		date.setUTCHours(0, 0, 0, 0);
	} else {
		date.setUTCHours(0, 0, 0, 0);
	}
	return date.getTime();
};

/**
 * Predicts how many bars the chart will render, replicating the backend's
 * `generateAllPeriods` (bin-aligned start, inclusive bins up to end). Used only
 * for the pre-data loading frames; once data arrives the real count is used.
 */
export const predictBarCount = ({
	interval,
	binSize,
	start,
	end,
}: {
	interval: string;
	binSize: string | null;
	start: number | null;
	end: number | null;
}): number => {
	const bin = resolveBinSize({ interval, binSize });
	const rangeEnd = interval === "custom" && end ? end : Date.now();
	const rangeStart =
		interval === "custom" && start
			? start
			: rangeEnd - (STANDARD_INTERVAL_DAYS[interval] ?? 30) * MS_PER_DAY;

	const alignedStart = alignDown({ ms: rangeStart, binSize: bin });

	let count: number;
	if (bin === "month") {
		count = 0;
		const cursor = new Date(alignedStart);
		while (cursor.getTime() <= rangeEnd) {
			count++;
			cursor.setUTCMonth(cursor.getUTCMonth() + 1);
		}
	} else {
		const step = bin === "hour" ? MS_PER_HOUR : MS_PER_DAY;
		count = Math.floor((rangeEnd - alignedStart) / step) + 1;
	}

	return Math.min(Math.max(count, MIN_BARS), MAX_BARS);
};
