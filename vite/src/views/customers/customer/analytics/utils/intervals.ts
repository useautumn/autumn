import { format } from "date-fns";

export type Granularity = "hour" | "day" | "week" | "month";

export const CUSTOM_INTERVAL = "custom";

export const INTERVAL_LABELS: Record<string, string> = {
	"24h": "Last 24 hours",
	"7d": "Last 7 days",
	"30d": "Last 30 days",
	"1bc": "Current billing cycle",
	"90d": "Last 90 days",
	"3bc": "Latest 3 billing cycles",
	"6m": "Last 6 months",
	"12m": "Last 12 months",
};

export const BILLING_CYCLE_INTERVALS = new Set(["1bc", "3bc"]);

export const INTERVAL_GRANULARITIES: Record<string, Granularity[]> = {
	"24h": ["hour"],
	"7d": ["day"],
	"30d": ["day", "week"],
	"1bc": ["day"],
	"90d": ["day", "week", "month"],
	"3bc": ["day", "week", "month"],
	"6m": ["month", "week"],
	"12m": ["month", "week"],
	custom: ["day", "week", "month"],
};

export const GRANULARITY_LABELS: Record<Granularity, string> = {
	hour: "by hour",
	day: "by day",
	week: "by week",
	month: "by month",
};

const DEFAULT_GRANULARITIES: Granularity[] = ["day"];

export const granularitiesFor = (interval: string): Granularity[] =>
	INTERVAL_GRANULARITIES[interval] ?? DEFAULT_GRANULARITIES;

export const getEffectiveBinSize = ({
	interval,
	binSize,
}: {
	interval: string;
	binSize?: string | null;
}): Granularity => {
	const granularities = granularitiesFor(interval);
	return binSize && granularities.some((g) => g === binSize)
		? (binSize as Granularity)
		: granularities[0];
};

export const INTERVAL_SHORT_LABELS: Record<string, string> = {
	"24h": "24h",
	"7d": "7d",
	"30d": "30d",
	"1bc": "This cycle",
	"90d": "90d",
	"3bc": "3 cycles",
	"6m": "6m",
	"12m": "12m",
};

export const describeInterval = ({
	interval,
	binSize,
	start,
	end,
}: {
	interval: string;
	binSize: Granularity;
	start?: number | null;
	end?: number | null;
}): string => {
	const rangeLabel =
		interval === CUSTOM_INTERVAL && start && end
			? `${format(start, "MMM d")} – ${format(end, "MMM d")}`
			: (INTERVAL_LABELS[interval] ?? interval);
	return `${rangeLabel}, ${GRANULARITY_LABELS[binSize]}`;
};
