import type { TrialContext } from "@autumn/shared";
import { secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";

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
		appliesToBilling: true,
		cardRequired: true,
	};
};
