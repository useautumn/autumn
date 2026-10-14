import type { StripeSubscriptionScheduleAction } from "@autumn/shared";
import { stripeRefToId } from "@autumn/shared";
import type Stripe from "stripe";

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
				price: stripeRefToId(item.price),
				quantity: item.quantity,
			})),
		})),
	},
});
