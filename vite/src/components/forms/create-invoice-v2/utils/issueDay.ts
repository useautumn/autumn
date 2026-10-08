import { UTCDate } from "@date-fns/utc";
import { getDate, getMonth, getYear, isSameDay, min } from "date-fns";

const MIDDAY_HOUR = 12;

/** Midday UTC prints as the picked day in nearly every timezone; today is left to Stripe's own "now". */
export const issueDayToParams = ({
	issueDay,
	now,
}: {
	issueDay: number | null;
	now: Date;
}): { issue_date?: number } => {
	if (issueDay === null || isSameDay(issueDay, now)) return {};
	const day = new Date(issueDay);
	const midday = new UTCDate(
		getYear(day),
		getMonth(day),
		getDate(day),
		MIDDAY_HOUR,
	);
	return { issue_date: min([midday, now]).getTime() };
};
