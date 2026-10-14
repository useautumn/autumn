export const acceptsCarryOverUsages = ({
	replacesPlanNow,
	resetsCycleNow,
	endsTrialNow,
}: {
	replacesPlanNow: boolean;
	resetsCycleNow: boolean;
	endsTrialNow: boolean;
}) => replacesPlanNow || resetsCycleNow || endsTrialNow;
