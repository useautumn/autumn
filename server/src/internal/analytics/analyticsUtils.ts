import {
	cusProductToProduct,
	EntInterval,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerEntitlement,
	type FullProduct,
	type Subscription,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { ACTIVE_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { isFreeProduct } from "../products/productUtils.js";

export async function getBillingCycleStartDate(
	customer?: FullCustomer,
	db?: DrizzleCli,
	intervalType?: "1bc" | "3bc" | "last_cycle",
) {
	if (!customer || !db || !intervalType) {
		return {};
	}

	const subscriptions = customer.subscriptions || [];
	const cusProducts = customer.customer_products.filter(
		(product: FullCusProduct) => ACTIVE_STATUSES.includes(product.status),
	);

	if (cusProducts.length === 0) return {};

	const fullProducts = cusProducts.map((cp: FullCusProduct) =>
		cusProductToProduct({ cusProduct: cp }),
	);

	const areAllProductsFree = checkIfAllProductsAreFree(fullProducts);
	const { startDates, endDates, createdDates } = areAllProductsFree
		? getDateRangesFromEntitlements(customer.customer_products)
		: getDateRangesFromSubscriptions(cusProducts, subscriptions);

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
): { startDates: string[]; endDates: string[]; createdDates: string[] } {
	const startDates: string[] = [];
	const endDates: string[] = [];
	const createdDates: string[] = [];

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
				createdDates.push(
					formatDateToString(new Date((subscription.created_at ?? 0) * 1000)),
				);
			}
		});
	});

	return { startDates, endDates, createdDates };
}

export function getDateRangesFromEntitlements(
	customerProducts?: FullCusProduct[],
): { startDates: string[]; endDates: string[]; createdDates: string[] } {
	const startDates: string[] = [];
	const endDates: string[] = [];
	const createdDates: string[] = [];

	if (!customerProducts || customerProducts.length < 1) {
		return { startDates, endDates, createdDates };
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

				createdDates.push(formatDateToString(new Date(entitlement.created_at)));
			},
		);
	});

	return { startDates, endDates, createdDates };
}

export function calculateBillingCycleResult(
	startDates: string[],
	endDates: string[],
	createdDates: string[],
	intervalType: "1bc" | "3bc" | "last_cycle",
) {
	const currentStartDate = new Date(startDates[0]);
	const currentEndDate = new Date(endDates[0]);
	const gap = currentEndDate.getTime() - currentStartDate.getTime();
	const gapDays = Math.floor(gap / (1000 * 60 * 60 * 24));

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
