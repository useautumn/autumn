import {
	BillingMethod,
	isFeaturePriceItem,
	type ProductItem,
} from "@autumn/shared";
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

export type ServicePeriodTarget =
	| { kind: "all" }
	| { kind: "base" }
	| { kind: "feature"; featureId: string; behavior: BillingMethod };

export type ServicePeriodTargetOption =
	| { kind: "all" }
	| { kind: "base" }
	| { kind: "feature"; featureId: string; behaviors: BillingMethod[] };

const behaviorOf = (item: ProductItem) =>
	item.usage_model === "prepaid"
		? BillingMethod.Prepaid
		: BillingMethod.UsageBased;

export const featurePeriodKey = ({
	featureId,
	behavior,
}: {
	featureId: string;
	behavior: BillingMethod;
}) => `${featureId}:${behavior}`;

/** All prices, the base price, then each priced feature with the behaviours it bills. */
export function listServicePeriodTargets({
	items,
}: {
	items: ProductItem[] | null | undefined;
}): ServicePeriodTargetOption[] {
	const behaviorsByFeature = new Map<string, BillingMethod[]>();
	for (const item of items ?? []) {
		if (!item.feature_id || !isFeaturePriceItem(item)) continue;
		const behaviors = behaviorsByFeature.get(item.feature_id) ?? [];
		if (!behaviors.includes(behaviorOf(item))) behaviors.push(behaviorOf(item));
		behaviorsByFeature.set(item.feature_id, behaviors);
	}
	return [
		{ kind: "all" },
		{ kind: "base" },
		...[...behaviorsByFeature].map(([featureId, behaviors]) => ({
			kind: "feature" as const,
			featureId,
			behaviors,
		})),
	];
}

/**
 * All prices replaces every item override; the base price is the plan's period that
 * items inherit; a feature sets that line alone. Null clears; an empty range is ignored.
 */
export function applyServicePeriod({
	plan,
	target,
	period,
}: {
	plan: FormInvoicePlan;
	target: ServicePeriodTarget;
	period: ServicePeriod | null;
}): FormInvoicePlan {
	if (period && period.end <= period.start) return plan;
	if (target.kind === "all") return { ...plan, period, featurePeriods: {} };
	if (target.kind === "base") return { ...plan, period };

	const { [featurePeriodKey(target)]: _replaced, ...rest } =
		plan.featurePeriods;
	return {
		...plan,
		featurePeriods: period
			? { ...rest, [featurePeriodKey(target)]: period }
			: rest,
	};
}

export function servicePeriodForTarget({
	plan,
	target,
}: {
	plan: FormInvoicePlan;
	target: ServicePeriodTarget;
}): ServicePeriod | null {
	if (target.kind !== "feature") return plan.period;
	return plan.featurePeriods[featurePeriodKey(target)] ?? null;
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
	const matches = (period: ServicePeriod | null) =>
		period?.start === start && period.end === end;
	return plans
		.filter(
			(plan) =>
				matches(plan.period) ||
				Object.values(plan.featurePeriods).some(matches),
		)
		.map((plan) => plan._id);
}
