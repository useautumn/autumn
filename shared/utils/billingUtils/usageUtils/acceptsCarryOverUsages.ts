/** carry_over_usages applies only where usage moves now: a plan replaced now, or a billing cycle reset now. */
export const acceptsCarryOverUsages = ({
	replacesPlanNow,
	resetsCycleNow,
}: {
	replacesPlanNow: boolean;
	resetsCycleNow: boolean;
}) => replacesPlanNow || resetsCycleNow;
