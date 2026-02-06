import type { TrialContext } from "@autumn/shared";
import { secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";

/**
 * Inherits trial state from an existing Stripe subscription.
 * Used when merging into or downgrading from a trialing subscription.
 *
 * Returns undefined if subscription is not trialing.
 */
export const inheritTrialFromSubscription = ({
	stripeSubscription,
}: {
	stripeSubscription: Stripe.Subscription;
}): TrialContext | undefined => {
	if (!isStripeSubscriptionTrialing(stripeSubscription)) {
		return undefined;
	}

	const trialEndsAt = secondsToMs(stripeSubscription.trial_end ?? undefined);

	return {
		freeTrial: null,
		trialEndsAt,
		appliesToBilling: true, // Always true - we only call this for paid recurring products
		cardRequired: true,
	};
};
