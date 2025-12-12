import {
	cusProductToProduct,
	EntInterval,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerEntitlement,
	type FullProduct,
	type Subscription,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { ACTIVE_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { isFreeProduct } from "../products/productUtils.js";

export async function getBillingCycleStartDate(
	customer?: FullCustomer,
	db?: DrizzleCli,
	intervalType?: "1bc" | "3bc",
) {
	// If no customer provided, return empty object (for aggregateAll case)
	if (!customer || !db || !intervalType) {
		return {};
	}

	// const customerHasProducts = notNullish(customer.customer_products);
	// // const customerHasSubscriptions = notNullish(customer.subscriptions);

	// // if (!customerHasProducts) {
	// //   return {}; // No products, return empty object
	// // }

	// // const subscriptions = await AnalyticsService.getSubscriptionsIfNeeded(
	// //   customer,
	// //   customerHasSubscriptions,
	// //   db
	// // );

	const subscriptions = customer.subscriptions || [];
	const cusProducts = customer.customer_products.filter(
		(product: FullCusProduct) => ACTIVE_STATUSES.includes(product.status),
	);

	if (cusProducts.length === 0) return {};

	const fullProducts = cusProducts.map((cp: FullCusProduct) =>
		cusProductToProduct({ cusProduct: cp }),
	);

	const areAllProductsFree = checkIfAllProductsAreFree(fullProducts);
	const { startDates, endDates } = areAllProductsFree
		? getDateRangesFromEntitlements(customer.customer_products)
		: getDateRangesFromSubscriptions(cusProducts, subscriptions);

	if (startDates.length === 0 || endDates.length === 0) {
		return {};
	}

	return calculateBillingCycleResult(startDates, endDates, intervalType);
}

export function checkIfAllProductsAreFree(
	fullProducts: FullProduct[],
): boolean {
	return fullProducts.every((product: FullProduct) => {
		const isFree = isFreeProduct(product.prices);

		return isFree;
	});
}

export function formatDateToString(date: Date): string {
	return date.toISOString().replace("T", " ").split(".")[0];
}

export function getDateRangesFromSubscriptions(
	customerProductsFiltered: FullCusProduct[],
	subscriptions: Subscription[],
): { startDates: string[]; endDates: string[] } {
	const startDates: string[] = [];
	const endDates: string[] = [];

	customerProductsFiltered.forEach((product: FullCusProduct) => {
		product.subscription_ids?.forEach((subscriptionId: string) => {
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
			}
		});
	});

	return { startDates, endDates };
}

export function getDateRangesFromEntitlements(
	customerProducts?: FullCusProduct[],
): { startDates: string[]; endDates: string[] } {
	const startDates: string[] = [];
	const endDates: string[] = [];

	if (!customerProducts || customerProducts.length < 1) {
		return { startDates, endDates };
	}

	customerProducts.forEach((product: FullCusProduct) => {
		if (
			!product.customer_entitlements ||
			product.customer_entitlements.length < 1
		) {
			return;
		}

		product.customer_entitlements?.forEach(
			(entitlement: FullCustomerEntitlement) => {
				if (entitlement.next_reset_at) {
					endDates.push(
						formatDateToString(new Date(entitlement.next_reset_at)),
					);
				}

				const startDate = calculateStartDateFromInterval(
					entitlement.entitlement.interval,
					entitlement.next_reset_at,
					entitlement.created_at,
				);

				if (startDate) {
					startDates.push(startDate);
				}
			},
		);
	});

	return { startDates, endDates };
}

export function calculateBillingCycleResult(
	startDates: string[],
	endDates: string[],
	intervalType: "1bc" | "3bc",
) {
	const startDate = new Date(startDates[0]);
	const endDate = new Date(endDates[0]);
	const gap = endDate.getTime() - startDate.getTime();
	const gapDays = Math.floor(gap / (1000 * 60 * 60 * 24));

	return {
		startDate: startDates[0],
		endDate: endDates[0],
		gap: gapDays * (intervalType === "1bc" ? 1 : 3),
	};
}

export function calculateStartDateFromInterval(
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
		// Replicate ClickHouse's replaceAll(eventName, '''', '''''')
		const escapedEventName = eventName.replace(/'/g, "''");
		const columnName = noCount ? eventName : `${eventName}_count`;
		return `coalesce(sumIf(e.value, e.event_name = '${escapedEventName}'), 0) as \`${columnName}\``;
	});

	return expressions.join(",\n");
}

/**
 * Convert event periods from ISO strings to epoch timestamps.
 * @param events - The events to convert.
 * @returns The current time as an epoch timestamp for filtering.
 */
export function convertPeriodsToEpoch(
	events: Array<Record<string, string | number>>,
): number {
	const currentTime = new UTCDate().getTime();
	for (const event of events) {
		event.period = new UTCDate(event.period as string).getTime();
	}
	return currentTime;
}

/**
 * Normalize a group value to a string.
 * @param value - The value to normalize.
 * @returns The normalized value as a string or null if the value is null or empty.
 */
function normalizeGroupValue(value: unknown): string | null {
	if (value == null || value === "") return null;
	return String(value);
}

/**
 * Collect grouping metadata from a list of rows.
 * @param rows - The rows to collect metadata from.
 * @param groupByField - The field to group by.
 * @returns The group values and feature names.
 */
export function collectGroupingMetadata(
	rows: Array<Record<string, string | number>>,
	groupByField: string,
): { groupValues: Set<string>; featureNames: Set<string> } {
	const groupValues = new Set<string>();
	const featureNames = new Set<string>();

	for (const row of rows) {
		// biome-ignore lint/correctness/noUnusedVariables: period is required here but appears unused
		const { [groupByField]: groupValue, period, ...metrics } = row;
		const normalized = normalizeGroupValue(groupValue);
		if (normalized) {
			groupValues.add(normalized);
		}
		for (const featureName of Object.keys(metrics)) {
			featureNames.add(featureName);
		}
	}

	return { groupValues, featureNames };
}

/**
 * Build a grouped timeseries from a list of rows.
 * @param rows - The rows to build the grouped timeseries from.
 * @param groupByField - The field to group by.
 * @returns The grouped timeseries.
 */
export function buildGroupedTimeseries(
	rows: Array<Record<string, string | number>>,
	groupByField: string,
): Map<number, Record<string, number | Record<string, number>>> {
	const grouped = new Map<
		number,
		Record<string, number | Record<string, number>>
	>();

	for (const row of rows) {
		const { period, [groupByField]: groupValue, ...metrics } = row;
		const periodNum = Number(period);

		if (!grouped.has(periodNum)) {
			grouped.set(periodNum, { period: periodNum });
		}

		const normalized = normalizeGroupValue(groupValue);
		if (!normalized) continue;

		const periodData = grouped.get(periodNum)!;
		for (const [featureName, value] of Object.entries(metrics)) {
			if (!periodData[featureName]) {
				periodData[featureName] = {};
			}
			(periodData[featureName] as Record<string, number>)[normalized] =
				Number(value);
		}
	}

	return grouped;
}

/**
 * Backfill missing group values in a grouped timeseries.
 * @param grouped - The grouped timeseries to backfill.
 * @param groupValues - The group values to backfill.
 * @param featureNames - The feature names to backfill.
 */
export function backfillMissingGroupValues(
	grouped: Map<number, Record<string, number | Record<string, number>>>,
	groupValues: Set<string>,
	featureNames: Set<string>,
): void {
	for (const periodData of grouped.values()) {
		for (const featureName of featureNames) {
			if (!periodData[featureName]) {
				periodData[featureName] = {};
			}
			const featureData = periodData[featureName] as Record<string, number>;
			for (const groupValue of groupValues) {
				if (featureData[groupValue] === undefined) {
					featureData[groupValue] = 0;
				}
			}
		}
	}
}
