import {
	cusProductToProduct,
	EntInterval,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	MONTH_RANGES,
	RecaseError,
	type Subscription,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { format, startOfDay, startOfHour, startOfMonth, sub } from "date-fns";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ACTIVE_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { isFreeProduct } from "../products/productUtils.js";

export const STANDARD_INTERVAL_DAYS: Record<string, number> = {
	"24h": 1,
	"7d": 7,
	"30d": 30,
	"90d": 90,
};

const CLICKHOUSE_DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

/** Own-property lookup: the interval is arbitrary caller input, so an inherited
 * name like "toString" must not resolve to a range length. */
const lookupRangeLength = ({
	lengths,
	interval,
}: {
	lengths: Record<string, number>;
	interval?: string;
}): number | undefined => {
	if (interval === undefined) return undefined;
	// biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn needs lib ES2022; server targets ES2020.
	if (!Object.prototype.hasOwnProperty.call(lengths, interval)) {
		return undefined;
	}
	return lengths[interval];
};

const monthsForRange = ({
	interval,
}: {
	interval?: string;
}): number | undefined =>
	lookupRangeLength({ lengths: MONTH_RANGES, interval });

/** True when a range is measured in months rather than days. */
export const isMonthRange = ({ interval }: { interval?: string }): boolean =>
	monthsForRange({ interval }) !== undefined;

/** Default bin for a range when the caller didn't pick one: month ranges are
 * built for monthly bins, and 24h is too short for anything but hours. */
export const defaultBinSizeForRange = ({
	interval,
}: {
	interval?: string;
}): "hour" | "day" | "month" => {
	if (interval === "24h") return "hour";
	return monthsForRange({ interval }) === undefined ? "day" : "month";
};

/** Resolves the UTC window a standard (non billing-cycle) range covers. The
 * start is aligned down to the bin boundary so a chart's bucket filter and its
 * totals' timestamp filter select the same events. Returns undefined when the
 * range is unknown or billing-cycle based, which callers resolve per customer. */
export const getStandardIntervalWindow = ({
	interval,
	binSize,
	now = new UTCDate(),
}: {
	interval?: string;
	binSize?: string;
	now?: UTCDate;
}): { start: UTCDate; end: UTCDate } | undefined => {
	const months = monthsForRange({ interval });
	const days = lookupRangeLength({
		lengths: STANDARD_INTERVAL_DAYS,
		interval,
	});
	if (months === undefined && days === undefined) return undefined;

	const bin = binSize ?? defaultBinSizeForRange({ interval });

	// A month range counts bins, not days: "12m" is the last 12 monthly bars, so
	// the window opens on the 1st rather than leaving a partial leading bar.
	if (months !== undefined && bin === "month") {
		return { start: startOfMonth(sub(now, { months: months - 1 })), end: now };
	}

	const unaligned =
		months !== undefined ? sub(now, { months }) : sub(now, { days });
	return {
		start: bin === "hour" ? startOfHour(unaligned) : startOfDay(unaligned),
		end: now,
	};
};

/** Resolves the start/end window the event-name ranking should query so it
 * matches the chart's visible range. A custom range takes precedence; otherwise
 * the standard range resolves with the same boundary alignment the chart uses,
 * which is why the chart's bin size belongs here too. Returns undefined when
 * neither applies (e.g. billing-cycle ranges), leaving callers on all-time
 * ranking. */
export const getEventRankingWindow = ({
	interval,
	binSize,
	customRange,
}: {
	interval?: string;
	binSize?: string;
	customRange?: { start: number; end: number };
}): { startDate: string; endDate: string } | undefined => {
	if (customRange) {
		return {
			startDate: format(new UTCDate(customRange.start), CLICKHOUSE_DATE_FORMAT),
			endDate: format(new UTCDate(customRange.end), CLICKHOUSE_DATE_FORMAT),
		};
	}

	const window = getStandardIntervalWindow({ interval, binSize });
	if (!window) {
		return undefined;
	}

	return {
		startDate: format(window.start, CLICKHOUSE_DATE_FORMAT),
		endDate: format(window.end, CLICKHOUSE_DATE_FORMAT),
	};
};

export async function getBillingCycleStartDate({
	customer,
	db,
	intervalType,
	ctx,
}: {
	customer?: FullCustomer;
	db?: DrizzleCli;
	intervalType?: "1bc" | "3bc" | "last_cycle";
	ctx: AutumnContext;
}) {
	if (!customer || !db || !intervalType) {
		return {};
	}

	const subscriptions = customer.subscriptions || [];
	const cusProducts = customer.customer_products.filter(
		(product: FullCusProduct) => ACTIVE_STATUSES.includes(product.status),
	);

	if (cusProducts.length === 0) {
		return {};
	}

	const fullProducts = cusProducts.map((cp: FullCusProduct) =>
		cusProductToProduct({ cusProduct: cp }),
	);

	const areAllProductsFree = checkIfAllProductsAreFree(fullProducts);

	let { startDates, endDates, createdDates } = areAllProductsFree
		? getDateRangesFromEntitlements(customer.customer_products)
		: getDateRangesFromSubscriptions(cusProducts, subscriptions);

	// If we have subscription_ids but no matching subscriptions in DB, fallback to Stripe
	const hasMissingSubscriptions =
		!areAllProductsFree &&
		startDates.length === 0 &&
		cusProducts.some(
			(p) => p.subscription_ids && p.subscription_ids.length > 0,
		);

	if (hasMissingSubscriptions) {
		const stripeSubs = await fetchMissingSubscriptionsFromStripe({
			cusProducts,
			dbSubscriptions: subscriptions,
			ctx,
		});

		// Re-calculate date ranges with Stripe subscriptions
		const stripeDateRanges = getDateRangesFromStripeSubscriptions(
			cusProducts,
			stripeSubs,
		);

		startDates = stripeDateRanges.startDates;
		endDates = stripeDateRanges.endDates;
		createdDates = stripeDateRanges.createdDates;
	}

	if (startDates.length === 0 || endDates.length === 0) {
		return {};
	}

	return calculateBillingCycleResult(
		startDates,
		endDates,
		createdDates,
		intervalType,
	);
}

async function fetchMissingSubscriptionsFromStripe({
	cusProducts,
	dbSubscriptions,
	ctx,
}: {
	cusProducts: FullCusProduct[];
	dbSubscriptions: Subscription[];
	ctx: AutumnContext;
}): Promise<Stripe.Subscription[]> {
	// Collect all subscription IDs from products that aren't in the DB
	const missingSubIds: string[] = [];

	for (const product of cusProducts) {
		for (const subId of product.subscription_ids || []) {
			const foundInDb = dbSubscriptions.some((s) => s.stripe_id === subId);
			if (!foundInDb && subId) {
				missingSubIds.push(subId);
			}
		}
	}

	if (missingSubIds.length === 0) {
		return [];
	}

	const stripe = createStripeCli({ org: ctx.org, env: ctx.env });
	const stripeSubs: Stripe.Subscription[] = [];

	for (const subId of missingSubIds) {
		try {
			const stripeSub = await stripe.subscriptions.retrieve(subId);
			stripeSubs.push(stripeSub);
		} catch (error) {
			throw new RecaseError({
				message: `Failed to fetch subscription ${subId} from Stripe: ${error instanceof Error ? error.message : "Unknown error"}`,
				code: ErrCode.StripeError,
				statusCode: 500,
			});
		}
	}

	return stripeSubs;
}

function getDateRangesFromStripeSubscriptions(
	customerProductsFiltered: FullCusProduct[],
	stripeSubscriptions: Stripe.Subscription[],
): { startDates: string[]; endDates: string[]; createdDates: string[] } {
	const startDates: string[] = [];
	const endDates: string[] = [];
	const createdDates: string[] = [];

	for (const product of customerProductsFiltered) {
		for (const subscriptionId of product.subscription_ids || []) {
			const subscription = stripeSubscriptions.find(
				(s) => s.id === subscriptionId,
			);

			if (subscription) {
				// Use utility to extract period dates from subscription items
				const period = subToPeriodStartEnd({ sub: subscription });

				startDates.push(formatDateToString(new Date(period.start * 1000)));
				endDates.push(formatDateToString(new Date(period.end * 1000)));
				createdDates.push(
					formatDateToString(new Date(subscription.created * 1000)),
				);
			}
		}
	}

	return { startDates, endDates, createdDates };
}

function checkIfAllProductsAreFree(fullProducts: FullProduct[]): boolean {
	return fullProducts.every((product: FullProduct) => {
		const isFree = isFreeProduct(product.prices);

		return isFree;
	});
}

function formatDateToString(date: Date): string {
	return date.toISOString().replace("T", " ").split(".")[0];
}

function getDateRangesFromSubscriptions(
	customerProductsFiltered: FullCusProduct[],
	subscriptions: Subscription[],
): { startDates: string[]; endDates: string[]; createdDates: string[] } {
	const startDates: string[] = [];
	const endDates: string[] = [];
	const createdDates: string[] = [];

	for (const product of customerProductsFiltered) {
		for (const subscriptionId of product.subscription_ids || []) {
			const subscription = subscriptions.find(
				(subscription: Subscription) =>
					subscription.stripe_id === subscriptionId,
			);

			if (subscription) {
				startDates.push(
					formatDateToString(
						new Date((subscription.current_period_start ?? 0) * 1000),
					),
				);
				endDates.push(
					formatDateToString(
						new Date((subscription.current_period_end ?? 0) * 1000),
					),
				);
				createdDates.push(
					formatDateToString(new Date((subscription.created_at ?? 0) * 1000)),
				);
			}
		}
	}

	return { startDates, endDates, createdDates };
}

function getDateRangesFromEntitlements(customerProducts?: FullCusProduct[]): {
	startDates: string[];
	endDates: string[];
	createdDates: string[];
} {
	const startDates: string[] = [];
	const endDates: string[] = [];
	const createdDates: string[] = [];

	if (!customerProducts || customerProducts.length < 1) {
		return { startDates, endDates, createdDates };
	}

	for (const product of customerProducts) {
		if (
			!product.customer_entitlements ||
			product.customer_entitlements.length < 1
		) {
			continue;
		}

		for (const entitlement of product.customer_entitlements) {
			if (entitlement.next_reset_at) {
				endDates.push(formatDateToString(new Date(entitlement.next_reset_at)));
			}

			const startDate = calculateStartDateFromInterval(
				entitlement.entitlement.interval,
				entitlement.next_reset_at,
				entitlement.created_at,
			);

			if (startDate) {
				startDates.push(startDate);
			}

			createdDates.push(formatDateToString(new Date(entitlement.created_at)));
		}
	}

	return { startDates, endDates, createdDates };
}

function calculateBillingCycleResult(
	startDates: string[],
	endDates: string[],
	createdDates: string[],
	intervalType: "1bc" | "3bc" | "last_cycle",
) {
	const currentStartDate = new Date(startDates[0]);
	const currentEndDate = new Date(endDates[0]);
	const gap = currentEndDate.getTime() - currentStartDate.getTime();
	const gapDays = Math.floor(gap / (1000 * 60 * 60 * 24));

	if (intervalType === "1bc") {
		return {
			startDate: startDates[0],
			endDate: endDates[0],
			gap: gapDays,
		};
	}

	if (intervalType === "last_cycle") {
		const earliestCreation = createdDates.reduce((earliest, current) => {
			const currentDate = new Date(current);
			const earliestDate = new Date(earliest);
			return currentDate < earliestDate ? current : earliest;
		}, createdDates[0]);

		const createdAt = new Date(earliestCreation);

		const isSubscriptionCreatedDuringOrAfterCurrentPeriod =
			createdAt >= currentStartDate;
		if (isSubscriptionCreatedDuringOrAfterCurrentPeriod) {
			return {
				startDate: startDates[0],
				endDate: endDates[0],
				gap: gapDays,
			};
		}

		const previousEndDate = new Date(currentStartDate.getTime());
		const previousStartDate = new Date(currentStartDate.getTime() - gap);

		return {
			startDate: formatDateToString(previousStartDate),
			endDate: formatDateToString(previousEndDate),
			gap: gapDays,
		};
	}

	const gapMultiplier = 3;
	const now = new Date();

	// For analytics, we look BACKWARD from today for N billing cycles
	// End date is today, start date is today - (gap * multiplier)
	const adjustedStartDate = new Date(now.getTime() - gap * gapMultiplier);

	return {
		startDate: formatDateToString(adjustedStartDate),
		endDate: formatDateToString(now),
		gap: gapDays * gapMultiplier,
	};
}

function calculateStartDateFromInterval(
	interval: EntInterval | null | undefined,
	nextResetAt: number | null | undefined,
	createdAt: number,
): string | null {
	if (!nextResetAt && interval !== EntInterval.Lifetime) {
		return null;
	}

	switch (interval) {
		case EntInterval.Lifetime:
			return formatDateToString(new Date(createdAt));
		case EntInterval.Minute:
			return formatDateToString(new Date(nextResetAt! - 60 * 1000));
		case EntInterval.Hour:
			return formatDateToString(new Date(nextResetAt! - 60 * 60 * 1000));
		case EntInterval.Day:
			return formatDateToString(new Date(nextResetAt! - 24 * 60 * 60 * 1000));
		case EntInterval.Week:
			return formatDateToString(
				new Date(nextResetAt! - 7 * 24 * 60 * 60 * 1000),
			);
		case EntInterval.Month: {
			const monthResetDate = new Date(nextResetAt!);
			monthResetDate.setMonth(monthResetDate.getMonth() - 1);
			return formatDateToString(monthResetDate);
		}
		case EntInterval.Quarter: {
			const quarterResetDate = new Date(nextResetAt!);
			quarterResetDate.setMonth(quarterResetDate.getMonth() - 3);
			return formatDateToString(quarterResetDate);
		}
		case EntInterval.SemiAnnual: {
			const semiAnnualResetDate = new Date(nextResetAt!);
			semiAnnualResetDate.setMonth(semiAnnualResetDate.getMonth() - 6);
			return formatDateToString(semiAnnualResetDate);
		}
		case EntInterval.Year: {
			const yearResetDate = new Date(nextResetAt!);
			yearResetDate.setFullYear(yearResetDate.getFullYear() - 1);
			return formatDateToString(yearResetDate);
		}
		default:
			return null;
	}
}

export function generateEventCountExpressions(
	eventNames: string[],
	noCount: boolean = false,
): string {
	const expressions = eventNames.map((eventName) => {
		// Escape single quotes for SQL safety
		const escapedEventName = eventName.replace(/'/g, "''");
		const columnName = noCount ? eventName : `${eventName}_count`;
		return `coalesce(sumIf(e.value, e.event_name = '${escapedEventName}'), 0) as \`${columnName}\``;
	});

	return expressions.join(",\n");
}
