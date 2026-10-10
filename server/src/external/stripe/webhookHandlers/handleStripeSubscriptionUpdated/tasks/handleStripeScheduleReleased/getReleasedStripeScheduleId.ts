import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";

/** The schedule id a subscription just lost, when this event is its release. */
export const getReleasedStripeScheduleId = ({
	subscriptionUpdatedContext,
}: {
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): string | null => {
	const { stripeSubscription, previousAttributes } = subscriptionUpdatedContext;

	const previousSchedule = previousAttributes.schedule;
	if (!previousSchedule || stripeSubscription.schedule) return null;

	return typeof previousSchedule === "string"
		? previousSchedule
		: previousSchedule.id;
};
