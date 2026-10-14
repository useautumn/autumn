import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";

export const expandPlanFilterDisjuncts = (
	filter: PlanFilter,
): PlanFilter[][] => {
	const { $or, ...base } = filter;
	if ($or === undefined) return [[base]];
	return $or.flatMap((branch) =>
		expandPlanFilterDisjuncts(branch).map((conjuncts) => [base, ...conjuncts]),
	);
};
