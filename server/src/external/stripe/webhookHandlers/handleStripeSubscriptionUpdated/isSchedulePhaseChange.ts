import { notNullish } from "@autumn/shared";
import type { StripeSubscriptionUpdatedContext } from "./stripeSubscriptionUpdatedContext";

/** Stripe's only signal that a schedule advanced: items changed while a schedule is attached. */
export const isSchedulePhaseChange = ({
	subscriptionUpdatedContext,
}: {
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): boolean => {
	const { stripeSubscription, previousAttributes } = subscriptionUpdatedContext;
	return (
		notNullish(previousAttributes?.items) &&
		notNullish(stripeSubscription.schedule)
	);
};
