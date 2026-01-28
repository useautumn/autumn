import type Stripe from "stripe";

export const getStripeActiveSubscriptionSchedule = async ({
	stripeClient,
	subscriptionScheduleId,
}: {
	stripeClient: Stripe;
	subscriptionScheduleId: string;
}): Promise<Stripe.SubscriptionSchedule | undefined> => {
	const schedule = await stripeClient.subscriptionSchedules.retrieve(
		subscriptionScheduleId,
	);

	if (schedule.status === "canceled" || schedule.status === "released") {
		return undefined;
	}

	return schedule;
};
