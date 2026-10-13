import {
	anchorFollowsKeptTrial as anchorFollowsKeptTrialRule,
	type BillingContext,
} from "@autumn/shared";
import { isTrialBackdateRecreate } from "./isTrialBackdateRecreate";

/** The shared kept-trial anchor rule, read from the request; Set Plans' sheet applies the same rule. */
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
	return anchorFollowsKeptTrialRule({
		backdatesTrialingSubscription: isTrialBackdateRecreate({ billingContext }),
		keepsTrial: typeof trialContext?.trialEndsAt === "number",
		anchorMs:
			typeof requestedBillingCycleAnchor === "number"
				? requestedBillingCycleAnchor
				: undefined,
		trialEndsAt: trialContext?.trialEndsAt,
	});
};
