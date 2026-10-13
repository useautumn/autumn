import { type BillingContext, prorationBehaviorOverride } from "@autumn/shared";
import { anchorFollowsKeptTrial } from "./anchorFollowsKeptTrial";
import { endsLiveTrial } from "./endsLiveTrial";

/** The shared proration override, read from the request; Set Plans' sheet applies the same rule. */
export const setPlansProrationOverride = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		| "stripeSubscription"
		| "replacedStripeSubscription"
		| "subscriptionBackdateStartMs"
		| "requestedBillingCycleAnchor"
		| "trialContext"
		| "currentEpochMs"
	> & { immediatePhase?: { starts_at: number } };
}) =>
	prorationBehaviorOverride({
		endsTrialNow: endsLiveTrial({ billingContext }),
		resetsCycleNow: billingContext.requestedBillingCycleAnchor === "now",
		anchorFollowsKeptTrial: anchorFollowsKeptTrial({ billingContext }),
	});
