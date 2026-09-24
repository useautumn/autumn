import { UTCDate } from "@date-fns/utc";
import { getDate, getMonth, getYear, isSameDay, min } from "date-fns";

const MIDDAY_HOUR = 12;

/** Midday UTC prints as the same calendar day in nearly every timezone, including Stripe's. */
const toMiddayUtc = (day: Date) =>
	new UTCDate(getYear(day), getMonth(day), getDate(day), MIDDAY_HOUR);

/** An issue day of today is left to Stripe, which stamps it with its own "now". */
export const invoiceDaysToParams = ({
	issueDay,
	dueDay,
	now,
}: {
	issueDay: number | null;
	dueDay: number | null;
	now: Date;
}): { issue_date?: number; due_date?: number } => ({
	...(issueDay === null || isSameDay(issueDay, now)
		? {}
		: { issue_date: min([toMiddayUtc(new Date(issueDay)), now]).getTime() }),
	...(dueDay === null
		? {}
		: { due_date: toMiddayUtc(new Date(dueDay)).getTime() }),
});
