import type { AtomMetricsStatistic } from "@autumn/shared";
import { format } from "date-fns";
import { niceAxisTicks } from "@/views/customers/customer/analytics/utils/chartGeometry";

const NO_READING = "—";

const MINUTE_MS = 60_000;

export const STATISTIC_LABELS: Record<
	AtomMetricsStatistic,
	{ name: string; column: string }
> = {
	maximum: { name: "Maximum", column: "Max" },
	average: { name: "Average", column: "Avg" },
};

const SMALLEST_RATE = 0.01;
const WHOLE_FROM = 100;
const COMPACT_FROM = 1000;

const rateFormat = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 2,
});

const wholeRateFormat = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 0,
});

const compactRateFormat = new Intl.NumberFormat(undefined, {
	notation: "compact",
	maximumFractionDigits: 2,
});

export const formatPercent = (share: number | null) =>
	share === null ? NO_READING : `${Math.round(share * 100)}%`;

export const formatRate = (perSecond: number | null) => {
	if (perSecond === null) return NO_READING;
	if (perSecond > 0 && perSecond < SMALLEST_RATE)
		return `<${rateFormat.format(SMALLEST_RATE)}`;
	if (perSecond >= COMPACT_FROM) return compactRateFormat.format(perSecond);
	if (perSecond >= WHOLE_FROM) return wholeRateFormat.format(perSecond);
	return rateFormat.format(perSecond);
};

export const rateAxisTicks = ({ max }: { max: number }) => {
	const ticks = niceAxisTicks({ max });
	if (ticks[1] >= SMALLEST_RATE) return ticks;
	const count = Math.ceil(max / SMALLEST_RATE) + 1;
	return Array.from({ length: count }, (_, index) => index * SMALLEST_RATE);
};

const timeZoneName = (at: number) =>
	new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
		.formatToParts(at)
		.find((part) => part.type === "timeZoneName")?.value;

export const formatMetricsTimestamp = (at: number) =>
	[format(at, "MMM d, HH:mm:ss"), timeZoneName(at)].filter(Boolean).join(" ");

export const formatMetricsWindow = ({
	at,
	endAt,
}: {
	at: number;
	endAt: number;
}) => {
	const timeFormat = endAt - at < MINUTE_MS ? "HH:mm:ss" : "HH:mm";
	return `${format(at, `MMM d, ${timeFormat}`)}–${format(endAt, timeFormat)}`;
};
