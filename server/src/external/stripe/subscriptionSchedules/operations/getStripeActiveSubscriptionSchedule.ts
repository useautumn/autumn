import type Stripe from "stripe";

export const getStripeActiveSubscriptionSchedule = async ({
	stripeClient,
	subscriptionScheduleId,
	expand,
}: {
	stripeClient: Stripe;
	subscriptionScheduleId: string;
	expand?: string[];
}): Promise<Stripe.SubscriptionSchedule | undefined> => {
	const schedule = await stripeClient.subscriptionSchedules.retrieve(
		subscriptionScheduleId,
		expand ? { expand } : undefined,
	);

	if (schedule.status === "canceled" || schedule.status === "released") {
		return undefined;
	}

	return schedule;
};
