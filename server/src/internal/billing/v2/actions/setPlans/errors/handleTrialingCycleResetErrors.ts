import { type CreateScheduleBillingContext, secondsToMs } from "@autumn/shared";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { setPlansError } from "./setPlansError";

/** Stripe rejects billing_cycle_anchor=now on a trialing subscription, since the trial end anchors its cycle. */
export const handleTrialingCycleResetErrors = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	const { requestedBillingCycleAnchor, stripeSubscription } = billingContext;
	if (requestedBillingCycleAnchor !== "now") return;
	if (!isStripeSubscriptionTrialing(stripeSubscription)) return;

	throw setPlansError({
		details: {
			type: "trialing_cycle_reset",
			trial_ends_at: secondsToMs(stripeSubscription.trial_end),
		},
	});
};
