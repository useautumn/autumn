import type { FullProduct, TrialContext } from "@autumn/shared";
import type Stripe from "stripe";
import { isStripeSubscriptionAnchoredToMonthStart } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { getMonthStartAnchorMs } from "@/internal/billing/v2/utils/cycleAnchor/getMonthStartAnchorMs";

/**
 * The anchor the caller asked for, or the one a month-start plan asks for on its
 * behalf: the next 1st, when the plan starts now on a cycle not already on a 1st.
 */
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

	// A scheduled start follows the outgoing cycle; a cycle already on a 1st stays.
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
