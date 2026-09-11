import { isAutumnManagedStripeSchedule } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";
import { isSchedulePhaseChange } from "./isSchedulePhaseChange";
import type { StripeSubscriptionUpdatedContext } from "./stripeSubscriptionUpdatedContext";

/**
 * An Autumn-owned schedule advancing is Autumn's own plan playing out, not an
 * external edit. Schedules the customer built in Stripe still back-sync.
 */
export const isAutumnScheduledPhaseChange = ({
	subscriptionUpdatedContext,
}: {
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): boolean =>
	isSchedulePhaseChange({ subscriptionUpdatedContext }) &&
	isAutumnManagedStripeSchedule({
		schedule: subscriptionUpdatedContext.stripeSubscription.schedule,
	});
