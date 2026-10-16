import { ACTIONS, type ApprovalAction } from "../actions/approvalActions";
import type { ApprovalRuleFilter } from "../schemas/filters/approvalFilterShapes";
import type { ApprovalFacts } from "./facts/approvalFacts";
import { FILTER_FIELDS_BY_KEY } from "./filter/areas/filterFieldsByKey";
import { buildUnsupportedMatch } from "./filter/buildUnsupportedMatch";
import type {
	FilterFields,
	FilterMatch,
	FilterMatchContext,
} from "./filter/filterFieldTypes";
import { matchFilter } from "./filter/matchFilter";
import type { ApprovalViolation } from "./types/approvalViolation";

const matchActionFilter = ({
	filter,
	action,
	facts,
	context,
}: {
	filter: ApprovalRuleFilter;
	action: ApprovalAction;
	facts: ApprovalFacts | null;
	context: FilterMatchContext;
}): FilterMatch => {
	const filterKey = ACTIONS[action].filter;
	if (filterKey === null || facts === null)
		return buildUnsupportedMatch({ field: "filter" });

	// Callers type facts by action (`ApprovalFactsFor`), so they fit this area's fields.
	const fields = FILTER_FIELDS_BY_KEY[filterKey] as FilterFields<ApprovalFacts>;
	return matchFilter({ filter, parent: facts, fields, path: "", context });
};

/**
 * Whether a rule's filter matches this request, with the conditions that held.
 * A condition the evaluator can't judge resolves pessimistically by effect: a
 * block still applies, an allow doesn't.
 */
export const matchRuleFilter = ({
	rule,
	action,
	facts,
	context,
}: {
	rule: { effect: "allow" | "block"; filter: ApprovalRuleFilter | null };
	action: ApprovalAction;
	facts: ApprovalFacts | null;
	context: FilterMatchContext;
}): { matches: boolean; conditions: ApprovalViolation[] } => {
	if (rule.filter === null) return { matches: true, conditions: [] };

	const match = matchActionFilter({
		filter: rule.filter,
		action,
		facts,
		context,
	});
	if (match.result === "match")
		return { matches: true, conditions: match.conditions };

	const blockAppliesWhenUnsure =
		match.result === "unsupported" && rule.effect === "block";
	if (blockAppliesWhenUnsure)
		return { matches: true, conditions: match.conditions };
	return { matches: false, conditions: [] };
};
