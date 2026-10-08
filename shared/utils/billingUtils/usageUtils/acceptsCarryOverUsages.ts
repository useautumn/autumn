/** carry_over_usages applies where usage moves now: a plan replaced now, a billing cycle reset now, or a trial ending now. */
export const acceptsCarryOverUsages = ({
	replacesPlanNow,
	resetsCycleNow,
	endsTrialNow,
}: {
	replacesPlanNow: boolean;
	resetsCycleNow: boolean;
	endsTrialNow: boolean;
}) => replacesPlanNow || resetsCycleNow || endsTrialNow;
