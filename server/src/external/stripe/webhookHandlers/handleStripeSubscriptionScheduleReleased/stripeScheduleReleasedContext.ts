import type Stripe from "stripe";

export type StripeScheduleReleasedContext = {
	schedule: Stripe.SubscriptionSchedule;
	results: {
		detachedSchedulePhases?: { detachedCount: number; clearedCount: number };
	};
};
