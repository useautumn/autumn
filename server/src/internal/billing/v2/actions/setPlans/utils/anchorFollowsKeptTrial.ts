import {
	anchorFollowsKeptTrial as anchorFollowsKeptTrialRule,
	type BillingContext,
} from "@autumn/shared";
import { isTrialBackdateRecreate } from "./isTrialBackdateRecreate";

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
