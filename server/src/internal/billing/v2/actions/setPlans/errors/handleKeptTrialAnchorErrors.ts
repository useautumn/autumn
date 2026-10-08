import {
	type CreateScheduleBillingContext,
	formatMsToDate,
} from "@autumn/shared";
import { assertNoBillingCycleAnchorWithTrial } from "@/internal/billing/v2/common/errors/assertNoBillingCycleAnchorWithTrial";
import { anchorFollowsKeptTrial } from "../utils/anchorFollowsKeptTrial";
import { isTrialBackdateRecreate } from "../utils/isTrialBackdateRecreate";
import { invalidSetPlansRequest } from "./invalidSetPlansRequest";

/**
 * A trial controls the cycle start, except on a backdated trialing recreate, where Stripe's create takes an anchor
 * after the kept trial ends. It rejects an earlier anchor, and requires the stub between them to be prorated.
 */
export const handleKeptTrialAnchorErrors = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	if (!isTrialBackdateRecreate({ billingContext })) {
		assertNoBillingCycleAnchorWithTrial({ billingContext });
		return;
	}

	const { requestedBillingCycleAnchor, trialContext } = billingContext;
	const trialEndsAt = trialContext?.trialEndsAt;
	if (typeof requestedBillingCycleAnchor !== "number" || !trialEndsAt) return;

	if (requestedBillingCycleAnchor < trialEndsAt) {
		throw invalidSetPlansRequest(
			`billing_cycle_anchor is before the kept trial ends on ${formatMsToDate(trialEndsAt)}. Move the anchor on or after the trial end, or turn the trial off.`,
		);
	}
	if (
		anchorFollowsKeptTrial({ billingContext }) &&
		billingContext.requestedProrationBehavior === "none"
	) {
		throw invalidSetPlansRequest(
			"Stripe bills the time between the trial end and billing_cycle_anchor, so proration_behavior can't be none here. Use prorate_immediately, or turn the trial off.",
		);
	}
};
