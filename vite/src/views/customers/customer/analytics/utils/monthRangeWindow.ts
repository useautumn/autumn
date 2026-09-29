import { UTCDate } from "@date-fns/utc";
import { startOfDay, startOfMonth, subMonths } from "date-fns";

const MONTHS_BY_RANGE: Record<string, number> = { "6m": 6, "12m": 12 };

export const isMonthRange = ({ interval }: { interval: string }) =>
	interval in MONTHS_BY_RANGE;

/**
 * The public API has no month presets, so month ranges go out as a custom
 * range. Monthly bins open on the 1st so the leading bar isn't partial.
 */
export const monthRangeWindow = ({
	interval,
	binSize,
}: {
	interval: string;
	binSize: string;
}): { start: number; end: number } | undefined => {
	const months = MONTHS_BY_RANGE[interval];
	if (months === undefined) return undefined;

	const now = new UTCDate();
	const start =
		binSize === "month"
			? startOfMonth(subMonths(now, months - 1))
			: startOfDay(subMonths(now, months));
	return { start: start.getTime(), end: now.getTime() };
};
