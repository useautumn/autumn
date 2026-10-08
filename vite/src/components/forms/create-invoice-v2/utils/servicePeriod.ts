import { UTCDate } from "@date-fns/utc";
import { getDate, getMonth, getYear } from "date-fns";
import type {
	FormInvoicePlan,
	ServicePeriod,
} from "../createInvoiceFormSchema";

/** Periods are stored as UTC midnights so a picked day bills the same day everywhere, Stripe included. */
export const calendarDayToUtcDay = (day: Date): number =>
	Date.UTC(getYear(day), getMonth(day), getDate(day));

export const utcDayToCalendarDay = (utcDay: number): Date => {
	const day = new UTCDate(utcDay);
	return new Date(day.getFullYear(), day.getMonth(), day.getDate());
};

const MONTH_DAY = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});

export const formatUtcDay = (utcDay: number): string =>
	MONTH_DAY_YEAR.format(utcDay);

export function formatServicePeriod(
	{ start, end }: ServicePeriod,
	{ compact = false }: { compact?: boolean } = {},
): string {
	if (compact) return `${MONTH_DAY.format(start)} – ${MONTH_DAY.format(end)}`;
	const sameYear =
		new UTCDate(start).getFullYear() === new UTCDate(end).getFullYear();
	return sameYear
		? `${MONTH_DAY.format(start)} – ${MONTH_DAY_YEAR.format(end)}`
		: `${MONTH_DAY_YEAR.format(start)} – ${MONTH_DAY_YEAR.format(end)}`;
}

/** Sets or clears a row's service period override; an empty range is ignored. */
export function withPlanServicePeriod({
	plan,
	period,
}: {
	plan: FormInvoicePlan;
	period: ServicePeriod | null;
}): FormInvoicePlan {
	if (period && period.end <= period.start) return plan;
	return { ...plan, period };
}

const OUTSIDE_PERIOD_ERROR = /\((\d+) to (\d+), unix ms\) falls outside/;

/** The rows whose override the server rejected for falling outside the invoice's service period. */
export function findPlansOutsideInvoicePeriod({
	errorMessage,
	plans,
}: {
	errorMessage: string | null;
	plans: FormInvoicePlan[];
}): string[] {
	const match = errorMessage?.match(OUTSIDE_PERIOD_ERROR);
	if (!match) return [];
	const [start, end] = [Number(match[1]), Number(match[2])];
	return plans
		.filter((plan) => plan.period?.start === start && plan.period.end === end)
		.map((plan) => plan._id);
}
