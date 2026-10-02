import type { StripeSubscriptionScheduleAction } from "@autumn/shared";
import type Stripe from "stripe";

/** An unchanged schedule gets no action, so its future items are read off the live schedule instead. */
export const liveScheduleAsUpdateAction = (
	schedule: Stripe.SubscriptionSchedule,
): StripeSubscriptionScheduleAction => ({
	type: "update",
	stripeSubscriptionScheduleId: schedule.id,
	params: {
		end_behavior: schedule.end_behavior,
		phases: schedule.phases.map((phase) => ({
			start_date: phase.start_date,
			end_date: phase.end_date,
			items: phase.items.map((item) => ({
				price: typeof item.price === "string" ? item.price : item.price.id,
				quantity: item.quantity,
			})),
		})),
	},
});
