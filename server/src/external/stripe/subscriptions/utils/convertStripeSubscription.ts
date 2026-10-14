import {
	CusProductStatus,
	EntInterval,
	ms,
	secondsToMs,
	stripeRefToId,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import { stripeTestClockToNowMs } from "@/external/stripe/testClocks/utils/convertStripeTestClock";

/**
 * Maps Stripe subscription status to Autumn CusProductStatus.
 *
 * Stripe subscription statuses:
 * - trialing: Customer is in trial period. Transitions to active after first payment.
 * - active: Subscription is in good standing.
 * - incomplete: Customer has 23 hours to make successful payment to activate.
 * - incomplete_expired: Initial payment failed and customer didn't pay within 23 hours. Terminal state.
 * - past_due: Payment on latest invoice failed. Subscription continues creating invoices.
 * - canceled: Subscription was cancelled. Terminal state.
 * - unpaid: Latest invoice hasn't been paid but subscription remains in place.
 * - paused: Trial ended without payment method. Invoices no longer created.
 */
export const stripeSubscriptionToAutumnStatus = ({
	stripeStatus,
}: {
	stripeStatus: Stripe.Subscription.Status;
}): CusProductStatus => {
	switch (stripeStatus) {
		case "trialing":
		case "active":
			return CusProductStatus.Active;

		case "incomplete":
		case "past_due":
		case "unpaid":
		case "paused":
			return CusProductStatus.PastDue;

		case "incomplete_expired":
		case "canceled":
			return CusProductStatus.Expired;

		default:
			return CusProductStatus.Unknown;
	}
};

export const stripeSubscriptionToTrialEndsAtMs = ({
	stripeSubscription,
}: {
	stripeSubscription: ExpandedStripeSubscription;
}) => {
	if (stripeSubscription.schedule) {
		let latestTrialEndsAt: number | undefined;
		for (const phase of stripeSubscription.schedule.phases) {
			if (phase.trial_end) {
				latestTrialEndsAt = phase.trial_end;
			}
		}
		return latestTrialEndsAt ? secondsToMs(latestTrialEndsAt) : undefined;
	}

	return stripeSubscription.trial_end
		? secondsToMs(stripeSubscription.trial_end)
		: undefined;
};

export const stripeSubscriptionToStartDate = ({
	stripeSubscription,
}: {
	stripeSubscription: Stripe.Subscription;
}) => {
	if (stripeSubscription.items.data.length === 0) {
		return stripeSubscription.start_date;
	}

	return stripeSubscription.items.data.reduce((earliestStartDate, item) => {
		return Math.min(earliestStartDate, item.current_period_start);
	}, stripeSubscription.items.data[0].current_period_start);
};

export const stripeSubscriptionToLatestInvoice = async ({
	stripeSubscription,
	stripeCli,
}: {
	stripeSubscription: ExpandedStripeSubscription;
	stripeCli: Stripe;
}): Promise<Stripe.Invoice | null> => {
	if (!stripeSubscription.latest_invoice) return null;

	if (typeof stripeSubscription.latest_invoice !== "string") {
		return stripeSubscription.latest_invoice;
	}

	return await stripeCli.invoices.retrieve(stripeSubscription.latest_invoice);
};

export const stripeSubscriptionToNowMs = async ({
	stripeSubscription,
	stripeCli,
}: {
	stripeSubscription: Stripe.Subscription;
	stripeCli: Stripe;
}): Promise<number> => {
	if (stripeSubscription.livemode) {
		return Date.now();
	}

	if (stripeSubscription.test_clock) {
		return stripeTestClockToNowMs({
			stripeCli,
			testClock: stripeSubscription.test_clock,
		});
	}

	if (
		stripeSubscription.customer &&
		typeof stripeSubscription.customer !== "string" &&
		"test_clock" in stripeSubscription.customer
	) {
		const customerTestClock = stripeSubscription.customer.test_clock;

		return stripeTestClockToNowMs({
			stripeCli,
			testClock: customerTestClock ?? undefined,
		});
	}

	return Date.now();
};

const STRIPE_INTERVAL_TO_ENT_INTERVAL: Partial<Record<string, EntInterval>> = {
	day: EntInterval.Day,
	week: EntInterval.Week,
	month: EntInterval.Month,
	year: EntInterval.Year,
};

const APPROX_INTERVAL_MS: Record<string, number> = {
	day: ms.days(1),
	week: ms.weeks(1),
	month: ms.months(1),
	year: ms.days(365),
};

const approxRecurringMs = (recurring: Stripe.Price.Recurring) =>
	(APPROX_INTERVAL_MS[recurring.interval] ?? 0) *
	(recurring.interval_count ?? 1);

export const stripeSubscriptionToLargestInterval = ({
	stripeSubscription,
}: {
	stripeSubscription: Stripe.Subscription;
}): { interval: EntInterval; intervalCount: number } | null => {
	let largest: Stripe.Price.Recurring | null = null;
	for (const item of stripeSubscription.items.data) {
		const recurring = item.price?.recurring;
		if (!recurring) continue;
		if (!largest || approxRecurringMs(recurring) > approxRecurringMs(largest)) {
			largest = recurring;
		}
	}

	const interval = largest
		? STRIPE_INTERVAL_TO_ENT_INTERVAL[largest.interval]
		: undefined;
	if (!largest || !interval) return null;
	return { interval, intervalCount: largest.interval_count ?? 1 };
};

export const stripeSubscriptionToScheduleId = ({
	stripeSubscription,
}: {
	stripeSubscription?: Stripe.Subscription;
}): string | undefined => {
	if (!stripeSubscription) return undefined;

	return stripeRefToId(stripeSubscription.schedule) ?? undefined;
};

export const stripeSubscriptionToApplication = ({
	stripeSubscription,
}: {
	stripeSubscription?: Stripe.Subscription;
}): string | null => {
	if (!stripeSubscription?.application) return null;

	return stripeRefToId(stripeSubscription.application);
};
