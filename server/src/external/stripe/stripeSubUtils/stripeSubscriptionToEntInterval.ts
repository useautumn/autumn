import { EntInterval } from "@autumn/shared";
import type Stripe from "stripe";

export interface SubscriptionEntInterval {
	interval: EntInterval;
	intervalCount: number;
}

/**
 * Derives the EntInterval + intervalCount from a Stripe subscription's plan.
 * Returns null if the subscription has no items or uses an unmappable interval.
 */
export const stripeSubscriptionToEntInterval = ({
	stripeSubscription,
}: {
	stripeSubscription: Stripe.Subscription;
}): SubscriptionEntInterval | null => {
	const firstItem = stripeSubscription.items.data[0];
	if (!firstItem?.plan) return null;

	const { interval, interval_count } = firstItem.plan;

	switch (interval) {
		case "week":
			return { interval: EntInterval.Week, intervalCount: interval_count };
		case "month":
			if (interval_count === 3)
				return { interval: EntInterval.Quarter, intervalCount: 1 };
			if (interval_count === 6)
				return { interval: EntInterval.SemiAnnual, intervalCount: 1 };
			return { interval: EntInterval.Month, intervalCount: interval_count };
		case "year":
			return { interval: EntInterval.Year, intervalCount: interval_count };
		default:
			return null;
	}
};
