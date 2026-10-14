import type { FullProduct, TrialContext } from "@autumn/shared";
import type Stripe from "stripe";
import { isStripeSubscriptionAnchoredToMonthStart } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { getMonthStartAnchorMs } from "@/internal/billing/v2/utils/cycleAnchor/getMonthStartAnchorMs";

export const setupRequestedBillingCycleAnchor = ({
	requestedBillingCycleAnchor,
	fullProducts,
	stripeSubscription,
	trialContext,
	currentEpochMs,
	startsNow,
}: {
	requestedBillingCycleAnchor?: number | "now";
	fullProducts: FullProduct[];
	stripeSubscription?: Stripe.Subscription;
	trialContext?: TrialContext;
	currentEpochMs: number;
	startsNow: boolean;
}): number | "now" | undefined => {
	if (requestedBillingCycleAnchor !== undefined) {
		return requestedBillingCycleAnchor;
	}

	if (!startsNow) return undefined;
	if (
		stripeSubscription &&
		isStripeSubscriptionAnchoredToMonthStart(stripeSubscription)
	) {
		return undefined;
	}

	return getMonthStartAnchorMs({
		fullProducts,
		startsAt: currentEpochMs,
		trialEndsAt: trialContext?.trialEndsAt,
	});
};
