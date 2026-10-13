export type ProrationBehaviorOverride = "bills_full_period" | "always_prorates";

/**
 * Where proration_behavior can't change what's billed: a trial ended with the cycle reset now bills the full period,
 * like Stripe's trial_end now, and an anchor after a kept trial's end is always prorated, as Stripe requires.
 */
export const prorationBehaviorOverride = ({
	endsTrialNow,
	resetsCycleNow,
	anchorFollowsKeptTrial,
}: {
	endsTrialNow: boolean;
	resetsCycleNow: boolean;
	anchorFollowsKeptTrial: boolean;
}): ProrationBehaviorOverride | undefined => {
	if (endsTrialNow && resetsCycleNow) return "bills_full_period";
	if (anchorFollowsKeptTrial) return "always_prorates";
	return undefined;
};

export const PRORATION_BEHAVIOR_OVERRIDE_REASONS: Record<
	ProrationBehaviorOverride,
	string
> = {
	bills_full_period: "Ending a trial now always bills the full period.",
	always_prorates:
		"Stripe always prorates the time between the trial end and the billing cycle anchor.",
};
