import {
	type BillingContext,
	type SetPlansParamsV0,
	secondsToMs,
} from "@autumn/shared";
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
 * Ending a live trial otherwise anchors the cycle: with no anchor requested, it starts on the old trial end.
 */
export const immediatePhaseBillingCycleAnchor = ({
	params,
	billingContext,
}: {
	params: FirstPhaseParams;
	billingContext: Pick<
		BillingContext,
		| "currentEpochMs"
		| "stripeSubscription"
		| "replacedStripeSubscription"
		| "trialContext"
	>;
}): BillingContext["requestedBillingCycleAnchor"] => {
	const anchor = requestedImmediatePhaseAnchor({
		params,
		currentEpochMs: billingContext.currentEpochMs,
	});
	const anchorsOnPhaseStart =
		params.phases[0].billing_cycle_anchor === "phase_start";
	if (!endsLiveTrial({ billingContext }) || anchorsOnPhaseStart) return anchor;

	// A backdate has already moved the trialing subscription aside to be replaced.
	const trialingSubscription =
		billingContext.stripeSubscription ??
		billingContext.replacedStripeSubscription;
	return anchor ?? secondsToMs(trialingSubscription?.trial_end ?? undefined);
};
