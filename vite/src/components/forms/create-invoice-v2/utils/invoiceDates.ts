import { UTCDate } from "@date-fns/utc";
import { getDate, getMonth, getYear, min } from "date-fns";

const MIDDAY_HOUR = 12;

/** Midday UTC prints as the same calendar day in nearly every timezone, including Stripe's. */
const toMiddayUtc = (day: Date) =>
	new UTCDate(getYear(day), getMonth(day), getDate(day), MIDDAY_HOUR);

const toLocalCalendarDay = (unixMs: number) => {
	const utcDay = new UTCDate(unixMs);
	return new Date(getYear(utcDay), getMonth(utcDay), getDate(utcDay));
};

/** Stripe rejects a future issue date, so an issue date of today is capped at now. */
export const calendarDaysToInvoiceDates = ({
	issueDay,
	dueDay,
	now,
}: {
	issueDay: Date;
	dueDay: Date;
	now: Date;
}) => ({
	issueDate: min([toMiddayUtc(issueDay), now]).getTime(),
	dueDate: toMiddayUtc(dueDay).getTime(),
});

export const invoiceDatesToCalendarDays = ({
	issueDate,
	dueDate,
}: {
	issueDate: number;
	dueDate: number;
}) => ({
	from: toLocalCalendarDay(issueDate),
	to: toLocalCalendarDay(dueDate),
});
