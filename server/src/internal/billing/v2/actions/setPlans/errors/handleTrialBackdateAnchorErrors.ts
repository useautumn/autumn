import {
	type CreateScheduleBillingContext,
	formatMsToDate,
	PRORATION_BEHAVIOR_OVERRIDE_REASONS,
} from "@autumn/shared";
import { invalidSetPlansRequest } from "./invalidSetPlansRequest";

/** Stripe's create takes an anchor after a kept trial ends; it rejects an earlier one and requires the stub to be prorated. */
export const handleTrialBackdateAnchorErrors = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
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
