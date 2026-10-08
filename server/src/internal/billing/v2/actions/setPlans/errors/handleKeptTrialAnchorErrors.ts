import {
	type CreateScheduleBillingContext,
	formatMsToDate,
	PRORATION_BEHAVIOR_OVERRIDE_REASONS,
} from "@autumn/shared";
import { assertNoBillingCycleAnchorWithTrial } from "@/internal/billing/v2/common/errors/assertNoBillingCycleAnchorWithTrial";
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
	const alwaysProrates = billingContext.prorationOverride === "always_prorates";
	if (alwaysProrates && billingContext.requestedProrationBehavior === "none") {
		throw invalidSetPlansRequest(
			`${PRORATION_BEHAVIOR_OVERRIDE_REASONS.always_prorates} proration_behavior can't be none here: use prorate_immediately, or turn the trial off.`,
		);
	}
};
