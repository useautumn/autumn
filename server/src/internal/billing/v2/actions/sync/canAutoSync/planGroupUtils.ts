import type { MatchedPlan, PhaseMatch } from "../detect/types";

export const filterMainPlans = ({
	plans,
}: {
	plans: PhaseMatch["plans"];
}): MatchedPlan[] => plans.filter((plan) => plan.product.is_add_on !== true);

export const findDuplicateMainPlanGroup = ({
	mainPlans,
}: {
	mainPlans: MatchedPlan[];
}): string | null => {
	const seen = new Set<string>();
	for (const plan of mainPlans) {
		const group = plan.product.group;
		if (!group) return "missing_group";
		if (seen.has(group)) return group;
		seen.add(group);
	}
	return null;
};
