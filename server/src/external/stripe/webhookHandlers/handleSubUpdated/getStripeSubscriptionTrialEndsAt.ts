import { secondsToMs } from "@autumn/shared";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";

/**
 * Gets the trial ends at in milliseconds for a Stripe subscription.
 * @param stripeSubscription - The Stripe subscription to get the trial ends at for.
 * @returns The trial ends at in milliseconds, or undefined if the subscription is not in the trial status.
 */
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
