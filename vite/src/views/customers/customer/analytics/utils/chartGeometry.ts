import { MONTH_RANGES, type MonthRangeEnum } from "@autumn/shared";
import { type Granularity, getEffectiveBinSize } from "./intervals";

export const CHART_MARGIN = { top: 17, right: 13, bottom: 5, left: 5 } as const;
export const Y_AXIS_WIDTH = 40;
export const X_AXIS_HEIGHT = 30;

export const PLOT_INSETS = {
	left: CHART_MARGIN.left + Y_AXIS_WIDTH,
	right: CHART_MARGIN.right,
	top: CHART_MARGIN.top,
	bottom: X_AXIS_HEIGHT + CHART_MARGIN.bottom,
} as const;

const DENSE_BAR_COUNT = 120;
const NO_SEGMENT_GAP_BAR_COUNT = 90;
const BUSY_SERIES_COUNT = 20;

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

export const SKELETON_Y_TICKS = Array.from(
	{ length: MAX_AXIS_INTERVALS + 1 },
	(_, i) => i,
);

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
		date.setUTCHours(0, 0, 0, 0);
		const daysSinceMonday = (date.getUTCDay() + 6) % 7;
		date.setUTCDate(date.getUTCDate() - daysSinceMonday);
	} else {
		date.setUTCHours(0, 0, 0, 0);
	}
	return date.getTime();
};

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
