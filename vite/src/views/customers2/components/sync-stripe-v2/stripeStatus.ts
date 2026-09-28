import type Stripe from "stripe";

export type StripeStatusTone = "good" | "warning" | "bad" | "neutral";

export type StripeStatus = { label: string; tone: StripeStatusTone };

const SUBSCRIPTION_STATUSES: Record<Stripe.Subscription.Status, StripeStatus> =
	{
		active: { label: "Active", tone: "good" },
		trialing: { label: "Trialing", tone: "good" },
		past_due: { label: "Past due", tone: "bad" },
		unpaid: { label: "Unpaid", tone: "bad" },
		incomplete: { label: "Incomplete", tone: "warning" },
		incomplete_expired: { label: "Incomplete expired", tone: "neutral" },
		paused: { label: "Paused", tone: "warning" },
		canceled: { label: "Canceled", tone: "neutral" },
	};

const SCHEDULE_STATUSES: Record<
	Stripe.SubscriptionSchedule.Status,
	StripeStatus
> = {
	not_started: { label: "Not started", tone: "neutral" },
	active: { label: "Active", tone: "good" },
	completed: { label: "Completed", tone: "neutral" },
	released: { label: "Released", tone: "neutral" },
	canceled: { label: "Canceled", tone: "neutral" },
};

const isCancelling = ({
	subscription,
}: {
	subscription: Stripe.Subscription;
}) =>
	subscription.status !== "canceled" &&
	(subscription.cancel_at_period_end || subscription.cancel_at !== null);

/** The status Stripe reports, with a pending cancel or paused collection
 * taking precedence since they change what the next invoice does. */
export const stripeObjectToStatus = ({
	subscription,
	schedule,
}: {
	subscription: Stripe.Subscription | null;
	schedule: Stripe.SubscriptionSchedule | null;
}): StripeStatus | null => {
	if (subscription) {
		if (isCancelling({ subscription }))
			return { label: "Cancelling", tone: "warning" };
		if (subscription.pause_collection)
			return { label: "Paused", tone: "warning" };
		return (
			SUBSCRIPTION_STATUSES[subscription.status] ?? {
				label: subscription.status,
				tone: "neutral",
			}
		);
	}
	if (schedule) {
		return (
			SCHEDULE_STATUSES[schedule.status] ?? {
				label: schedule.status,
				tone: "neutral",
			}
		);
	}
	return null;
};
