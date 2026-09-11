export type Granularity = "hour" | "day" | "week" | "month";

export const CUSTOM_INTERVAL = "custom";

// Time ranges shown in the dropdown, in display order.
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

// Billing-cycle ranges, hidden when the customer has no billing cycle.
export const BILLING_CYCLE_INTERVALS = new Set(["1bc", "3bc"]);

// Selectable granularities per range, in display order; the first is the
// default. A single entry means the range has no choice, so the granularity
// section is hidden for it. Month ranges omit "day" — hundreds of daily bars
// are unreadable and miss the monthly rollups that make those ranges fast.
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

/** The bin size in effect for a range: the viewer's choice when it's valid for
 * the range, otherwise the range's default (first) granularity. */
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
