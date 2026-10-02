import type Stripe from "stripe";

const SINGLE_INTERVAL_LABELS: Record<Stripe.Price.Recurring.Interval, string> =
	{
		day: "Daily",
		week: "Weekly",
		month: "Monthly",
		year: "Yearly",
	};

const APPROXIMATE_INTERVAL_DAYS: Record<
	Stripe.Price.Recurring.Interval,
	number
> = {
	day: 1,
	week: 7,
	month: 30,
	year: 365,
};

const recurringLengthInDays = (recurring: Stripe.Price.Recurring) =>
	APPROXIMATE_INTERVAL_DAYS[recurring.interval] * recurring.interval_count;

const findLongestRecurring = ({
	subscription,
}: {
	subscription: Stripe.Subscription;
}): Stripe.Price.Recurring | undefined =>
	(subscription.items?.data ?? [])
		.flatMap((item) => (item.price?.recurring ? [item.price.recurring] : []))
		.reduce<Stripe.Price.Recurring | undefined>(
			(longest, recurring) =>
				!longest ||
				recurringLengthInDays(recurring) > recurringLengthInDays(longest)
					? recurring
					: longest,
			undefined,
		);

/** How often the subscription bills, read from its longest recurring item. */
export const stripeSubscriptionIntervalLabel = ({
	subscription,
}: {
	subscription: Stripe.Subscription;
}): string | null => {
	const recurring = findLongestRecurring({ subscription });
	if (!recurring) return null;

	if (recurring.interval_count <= 1) {
		return SINGLE_INTERVAL_LABELS[recurring.interval];
	}
	if (recurring.interval === "month" && recurring.interval_count === 3) {
		return "Quarterly";
	}
	return `Every ${recurring.interval_count} ${recurring.interval}s`;
};
