import { secondsToMs } from "@autumn/shared";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";

export const getStripeSubscriptionTrialEndsAtMs = ({
	stripeSubscription,
}: {
	stripeSubscription: ExpandedStripeSubscription;
}) => {
	if (stripeSubscription.schedule) {
		// Get trial ends from latest phase
		let latestTrialEndsAt: number | undefined;
		for (const phase of stripeSubscription.schedule.phases) {
			if (phase.trial_end) {
				latestTrialEndsAt = phase.trial_end;
			}
		}
		return latestTrialEndsAt ? secondsToMs(latestTrialEndsAt) : undefined;
	}

	return stripeSubscription.trial_end
		? secondsToMs(stripeSubscription.trial_end)
		: undefined;
};
