import type { BillingContext } from "@autumn/shared";
import { isTrialBackdateRecreate } from "./isTrialBackdateRecreate";

/** A backdated trialing recreate keeps its trial and anchors the cycle after it ends, so Stripe bills a stub between. */
export const anchorFollowsKeptTrial = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		| "replacedStripeSubscription"
		| "subscriptionBackdateStartMs"
		| "requestedBillingCycleAnchor"
		| "trialContext"
	>;
}) => {
	const { requestedBillingCycleAnchor, trialContext } = billingContext;
	const trialEndsAt = trialContext?.trialEndsAt;
	return (
		isTrialBackdateRecreate({ billingContext }) &&
		typeof trialEndsAt === "number" &&
		typeof requestedBillingCycleAnchor === "number" &&
		requestedBillingCycleAnchor > trialEndsAt
	);
};
