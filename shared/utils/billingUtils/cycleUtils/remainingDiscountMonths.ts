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

const renewalAt = ({
	billingCycleAnchorMs,
	renewal,
	count,
}: {
	billingCycleAnchorMs: number;
	renewal: SubscriptionRenewal;
	count: number;
}) =>
	add(billingCycleAnchorMs, {
		[INTERVAL_DURATION_KEYS[renewal.interval]]: renewal.intervalCount * count,
	}).getTime();

/** The last renewal, from the period end on, inside the discount; each steps from the anchor so month ends don't drift. */
const lastDiscountedRenewal = ({
	billingCycleAnchorMs,
	periodEndMs,
	renewal,
	discountEndMs,
}: {
	billingCycleAnchorMs: number;
	periodEndMs: number;
	renewal: SubscriptionRenewal;
	discountEndMs: number;
}) => {
	let lastRenewal: number | undefined;
	for (let count = 0; ; count++) {
		const renewalMs = renewalAt({ billingCycleAnchorMs, renewal, count });
		if (renewalMs >= discountEndMs) return lastRenewal;
		if (renewalMs >= periodEndMs) lastRenewal = renewalMs;
	}
};

/**
 * Months a discount starting now must run to reach exactly the renewals the old one would have.
 * Zero when the old discount ends before the next renewal.
 */
export const remainingDiscountMonths = ({
	currentEpochMs,
	billingCycleAnchorMs,
	periodEndMs,
	renewal,
	discountEndMs,
}: {
	currentEpochMs: number;
	billingCycleAnchorMs: number;
	periodEndMs: number;
	renewal: SubscriptionRenewal;
	discountEndMs: number;
}) => {
	const lastRenewal = lastDiscountedRenewal({
		billingCycleAnchorMs,
		periodEndMs,
		renewal,
		discountEndMs,
	});
	// A long-cancelled subscription's discount may have run out already; its past renewals were never billed.
	if (lastRenewal === undefined || lastRenewal <= currentEpochMs) return 0;

	let months = 1;
	while (addMonths(currentEpochMs, months).getTime() <= lastRenewal) months++;
	return months;
};
