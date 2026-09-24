import { UTCDate } from "@date-fns/utc";
import { endOfDay, getDate, getMonth, getYear, startOfDay } from "date-fns";

type CalendarDays = { from: Date; to: Date };
type InvoicePeriod = { start: number; end: number };

const toUtcCalendarDay = (day: Date) =>
	new UTCDate(getYear(day), getMonth(day), getDate(day));

const toLocalCalendarDay = (unixMs: number) => {
	const utcDay = new UTCDate(unixMs);
	return new Date(getYear(utcDay), getMonth(utcDay), getDate(utcDay));
};

/** Bills the picked calendar days in UTC so every viewer's timezone prints the same dates. */
export const calendarDaysToInvoicePeriod = ({
	from,
	to,
}: CalendarDays): InvoicePeriod => ({
	start: startOfDay(toUtcCalendarDay(from)).getTime(),
	end: endOfDay(toUtcCalendarDay(to)).getTime(),
});

export const invoicePeriodToCalendarDays = ({
	start,
	end,
}: InvoicePeriod): CalendarDays => ({
	from: toLocalCalendarDay(start),
	to: toLocalCalendarDay(end),
});
