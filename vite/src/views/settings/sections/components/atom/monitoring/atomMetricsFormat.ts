import { format } from "date-fns";
import { niceAxisTicks } from "@/views/customers/customer/analytics/utils/chartGeometry";

const NO_READING = "—";

/** The smallest rate two decimals can show. */
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

/** e.g. "<0.01", "0.25", "184", "1.2K" */
export const formatRate = (perSecond: number | null) => {
	if (perSecond === null) return NO_READING;
	if (perSecond > 0 && perSecond < SMALLEST_RATE)
		return `<${rateFormat.format(SMALLEST_RATE)}`;
	if (perSecond >= COMPACT_FROM) return compactRateFormat.format(perSecond);
	if (perSecond >= WHOLE_FROM) return wholeRateFormat.format(perSecond);
	return rateFormat.format(perSecond);
};

/** Nice ticks up to `max`, never finer than `formatRate` can tell apart. */
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

/** e.g. "Oct 9, 14:30 BST" */
export const formatMetricsTimestamp = (at: number) =>
	[format(at, "MMM d, HH:mm"), timeZoneName(at)].filter(Boolean).join(" ");

/** e.g. "Oct 9, 14:00–14:30" */
export const formatMetricsWindow = ({
	at,
	endAt,
}: {
	at: number;
	endAt: number;
}) => `${format(at, "MMM d, HH:mm")}–${format(endAt, "HH:mm")}`;
