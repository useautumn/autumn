import { format } from "date-fns";
import type Stripe from "stripe";

export type SubscriptionRenewal =
	| { kind: "renews"; date: number }
	| { kind: "cancels"; date: number }
	| { kind: "payment_failed"; date: number }
	| { kind: "starts"; date: number }
	| { kind: "none" };

const MILLISECONDS_PER_SECOND = 1000;

const stripeTimestampToMs = (timestamp: number) =>
	timestamp * MILLISECONDS_PER_SECOND;

const firstItemPeriod = (subscription: Stripe.Subscription) =>
	subscription.items?.data?.[0];

const isCancelling = (subscription: Stripe.Subscription) =>
	subscription.cancel_at_period_end || subscription.cancel_at != null;

/** What happens next on the subscription's billing date; a failed payment
 * outranks a pending cancel since it needs attention first. */
export const stripeSubscriptionToRenewal = ({
	subscription,
}: {
	subscription: Stripe.Subscription;
}): SubscriptionRenewal => {
	const period = firstItemPeriod(subscription);

	if (subscription.status === "past_due" && period?.current_period_start) {
		return {
			kind: "payment_failed",
			date: stripeTimestampToMs(period.current_period_start),
		};
	}

	if (isCancelling(subscription)) {
		const cancelsAt = subscription.cancel_at ?? period?.current_period_end;
		if (cancelsAt) {
			return { kind: "cancels", date: stripeTimestampToMs(cancelsAt) };
		}
	}

	if (period?.current_period_end) {
		return {
			kind: "renews",
			date: stripeTimestampToMs(period.current_period_end),
		};
	}
	return { kind: "none" };
};

export const stripeScheduleToRenewal = ({
	schedule,
}: {
	schedule: Stripe.SubscriptionSchedule;
}): SubscriptionRenewal => {
	const startDate = schedule.phases?.[0]?.start_date;
	if (!startDate) return { kind: "none" };
	return { kind: "starts", date: stripeTimestampToMs(startDate) };
};

const RENEWAL_DATE_FORMAT = "MMM d, yyyy";

export const subscriptionRenewalLabel = ({
	renewal,
}: {
	renewal: SubscriptionRenewal;
}): string => {
	if (renewal.kind === "none") return "—";

	const date = format(renewal.date, RENEWAL_DATE_FORMAT);
	switch (renewal.kind) {
		case "payment_failed":
			return `Failed ${date}`;
		case "cancels":
			return `Cancels ${date}`;
		case "starts":
			return `Starts ${date}`;
		default:
			return date;
	}
};
