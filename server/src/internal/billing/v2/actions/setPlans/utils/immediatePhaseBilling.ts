import {
	type BillingContext,
	type SetPlansParamsV0,
	secondsToMs,
} from "@autumn/shared";
import { classifyFirstPhaseStart } from "../setup/classifyFirstPhaseStart";
import { endsLiveTrial, trialingStripeSubscription } from "./endsLiveTrial";

type FirstPhaseParams = Pick<SetPlansParamsV0, "phases">;

export const immediatePhaseProrationBehavior = ({
	params,
}: {
	params: FirstPhaseParams;
}) => params.phases[0].proration_behavior;

export const immediatePhaseBillingCycleAnchor = ({
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

export const setupTrialEndAnchorMs = ({
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
}): number | undefined => {
	const { billing_cycle_anchor: anchor, starts_at: startsAt } =
		params.phases[0];
	if (anchor !== undefined) return undefined;

	const endsTrial = endsLiveTrial({
		billingContext: {
			...billingContext,
			immediatePhase: {
				starts_at:
					typeof startsAt === "number"
						? startsAt
						: billingContext.currentEpochMs,
			},
		},
	});
	if (!endsTrial) return undefined;

	const trialEnd = trialingStripeSubscription({ billingContext })?.trial_end;
	return trialEnd ? secondsToMs(trialEnd) : undefined;
};
