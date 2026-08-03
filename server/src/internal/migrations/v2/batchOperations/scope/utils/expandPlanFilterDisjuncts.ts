import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";

/**
 * OR distributes over patches: each disjunct is a list of $or-free plan
 * filters ANDed together (sibling fields + one branch, recursively). A
 * product matched by a disjunct gets a patch carrying THAT disjunct's row
 * scope; the same product in several disjuncts trips the overlap guard —
 * an OR of row predicates on one product is not expressible as one scope.
 * `$or: []` yields no disjuncts (matches nothing).
 */
export const expandPlanFilterDisjuncts = (
	filter: PlanFilter,
): PlanFilter[][] => {
	const { $or, ...base } = filter;
	if ($or === undefined) return [[base]];
	return $or.flatMap((branch) =>
		expandPlanFilterDisjuncts(branch).map((conjuncts) => [base, ...conjuncts]),
	);
};
