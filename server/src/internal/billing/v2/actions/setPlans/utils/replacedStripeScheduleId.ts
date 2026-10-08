import { stripeRefToId } from "@autumn/shared";
import type Stripe from "stripe";

/** The schedule still attached to a subscription set_plans replaces. */
export const replacedStripeScheduleId = ({
	replacedStripeSubscription,
}: {
	replacedStripeSubscription?: Pick<Stripe.Subscription, "schedule">;
}) => {
	const schedule = replacedStripeSubscription?.schedule;
	return stripeRefToId(schedule);
};
