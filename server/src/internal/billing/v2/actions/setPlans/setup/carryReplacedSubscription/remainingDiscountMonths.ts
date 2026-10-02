import { add, addMonths } from "date-fns";
import type Stripe from "stripe";

export type SubscriptionRenewal = {
	interval: Stripe.Price.Recurring.Interval;
	intervalCount: number;
};

const INTERVAL_DURATION_KEYS = {
	day: "days",
	week: "weeks",
	month: "months",
	year: "years",
} as const;

const nextRenewal = ({
	from,
	renewal,
}: {
	from: number;
	renewal: SubscriptionRenewal;
}) =>
	add(from, {
		[INTERVAL_DURATION_KEYS[renewal.interval]]: renewal.intervalCount,
	}).getTime();

/** The last renewal, from the period end on, that still falls inside the discount. */
const lastDiscountedRenewal = ({
	periodEndMs,
	renewal,
	discountEndMs,
}: {
	periodEndMs: number;
	renewal: SubscriptionRenewal;
	discountEndMs: number;
}) => {
	let lastRenewal: number | undefined;
	for (
		let renewalMs = periodEndMs;
		renewalMs < discountEndMs;
		renewalMs = nextRenewal({ from: renewalMs, renewal })
	) {
		lastRenewal = renewalMs;
	}
	return lastRenewal;
};

/**
 * Months a discount starting now must run to reach exactly the renewals the old one would have.
 * Zero when the old discount ends before the next renewal.
 */
export const remainingDiscountMonths = ({
	currentEpochMs,
	periodEndMs,
	renewal,
	discountEndMs,
}: {
	currentEpochMs: number;
	periodEndMs: number;
	renewal: SubscriptionRenewal;
	discountEndMs: number;
}) => {
	const lastRenewal = lastDiscountedRenewal({
		periodEndMs,
		renewal,
		discountEndMs,
	});
	if (lastRenewal === undefined) return 0;

	let months = 1;
	while (addMonths(currentEpochMs, months).getTime() <= lastRenewal) months++;
	return months;
};
