const MAX_NAMED_PLANS = 2;

/** "Edit Pro", "Edit Pro + Credits", "Edit Pro + 2 more". */
export const editSubscriptionLabel = ({
	planNames,
}: {
	planNames: string[];
}) => {
	if (planNames.length === 0) return "Edit subscription";
	if (planNames.length <= MAX_NAMED_PLANS) {
		return `Edit ${planNames.join(" + ")}`;
	}
	return `Edit ${planNames[0]} + ${planNames.length - 1} more`;
};
