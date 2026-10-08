import type { BillingContext, SetPlansParamsV0 } from "@autumn/shared";
import { classifyFirstPhaseStart } from "../setup/classifyFirstPhaseStart";
import { endsLiveTrial } from "./endsLiveTrial";

type FirstPhaseParams = Pick<SetPlansParamsV0, "phases">;

export const immediatePhaseProrationBehavior = ({
	params,
}: {
	params: FirstPhaseParams;
}) => params.phases[0].proration_behavior;

const requestedImmediatePhaseAnchor = ({
	params,
	currentEpochMs,
}: {
	params: FirstPhaseParams;
	currentEpochMs: number;
}): BillingContext["requestedBillingCycleAnchor"] => {
	const { billing_cycle_anchor: anchor, starts_at: startsAt } =
		params.phases[0];
	if (anchor !== "phase_start") return anchor;

	const startsNow =
		typeof startsAt !== "number" ||
		classifyFirstPhaseStart({ startsAt, currentEpochMs }) === "now";
	return startsNow ? "now" : undefined;
};

/**
 * 'phase_start' on a first phase starting now resets the cycle now; a backdated or later start already anchors on itself.
 * Ending a live trial already resets the cycle now (Stripe's trial_end now), so a reset now on top of it is dropped.
 */
export const immediatePhaseBillingCycleAnchor = ({
	params,
	billingContext,
}: {
	params: FirstPhaseParams;
	billingContext: Pick<
		BillingContext,
		"currentEpochMs" | "stripeSubscription" | "trialContext"
	>;
}): BillingContext["requestedBillingCycleAnchor"] => {
	const anchor = requestedImmediatePhaseAnchor({
		params,
		currentEpochMs: billingContext.currentEpochMs,
	});
	const trialEndResetsCycleNow =
		anchor === "now" && endsLiveTrial({ billingContext });
	return trialEndResetsCycleNow ? undefined : anchor;
};
