import type { StripeSubscriptionScheduleAction } from "@autumn/shared";
import type Stripe from "stripe";

export const scheduleActionToParams = (
	subscriptionScheduleAction?: StripeSubscriptionScheduleAction,
): Stripe.SubscriptionScheduleUpdateParams | undefined => {
	switch (subscriptionScheduleAction?.type) {
		case "create":
		case "update":
			return subscriptionScheduleAction.params;
		default:
			return undefined;
	}
};
