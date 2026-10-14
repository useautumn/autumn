import { isAutumnManagedStripeSchedule } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";
import { isSchedulePhaseChange } from "./isSchedulePhaseChange";
import type { StripeSubscriptionUpdatedContext } from "./stripeSubscriptionUpdatedContext";

export const isAutumnScheduledPhaseChange = ({
	subscriptionUpdatedContext,
}: {
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): boolean =>
	isSchedulePhaseChange({ subscriptionUpdatedContext }) &&
	isAutumnManagedStripeSchedule({
		schedule: subscriptionUpdatedContext.stripeSubscription.schedule,
	});
