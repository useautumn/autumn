import type Stripe from "stripe";

const SINGLE_INTERVAL_LABELS: Record<Stripe.Price.Recurring.Interval, string> =
	{
		day: "Daily",
		week: "Weekly",
		month: "Monthly",
		year: "Yearly",
	};

/** How often the subscription bills, read from its first recurring item. */
export const stripeSubscriptionIntervalLabel = ({
	subscription,
}: {
	subscription: Stripe.Subscription;
}): string | null => {
	const recurring = subscription.items?.data?.find(
		(item) => item.price?.recurring,
	)?.price.recurring;
	if (!recurring) return null;

	if (recurring.interval_count <= 1) {
		return SINGLE_INTERVAL_LABELS[recurring.interval];
	}
	if (recurring.interval === "month" && recurring.interval_count === 3) {
		return "Quarterly";
	}
	return `Every ${recurring.interval_count} ${recurring.interval}s`;
};
