import type Stripe from "stripe";

const STRIPE_LIST_PAGE_SIZE = 100;

const LIVE_SCHEDULE_STATUSES = new Set<Stripe.SubscriptionSchedule.Status>([
	"active",
	"not_started",
]);

/** Ended schedules are dropped as they stream past, so memory tracks the live
 * ones rather than the org's whole history. */
export const sweepStripeSchedules = async ({
	stripeCli,
}: {
	stripeCli: Stripe;
}): Promise<Map<string, Stripe.SubscriptionSchedule>> => {
	const schedulesById = new Map<string, Stripe.SubscriptionSchedule>();

	const schedules = stripeCli.subscriptionSchedules.list({
		limit: STRIPE_LIST_PAGE_SIZE,
		expand: ["data.phases.items.price"],
	});
	for await (const schedule of schedules) {
		if (LIVE_SCHEDULE_STATUSES.has(schedule.status)) {
			schedulesById.set(schedule.id, schedule);
		}
	}

	return schedulesById;
};
