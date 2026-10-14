import { stripeRefToId } from "@autumn/shared";
import type Stripe from "stripe";

export const replacedStripeScheduleId = ({
	replacedStripeSubscription,
}: {
	replacedStripeSubscription?: Pick<Stripe.Subscription, "schedule">;
}) => {
	const schedule = replacedStripeSubscription?.schedule;
	return stripeRefToId(schedule);
};
