import type { ApprovalAction } from "../../actions/approvalActions";
import type { ApprovalRule } from "../../schemas/approvalRule";
import type { ApprovalFacts } from "../facts/approvalFacts";
import type { FilterMatchContext } from "../filter/filterFieldTypes";
import { matchRuleFilter } from "../matchRuleFilter";
import type { ApprovalViolation } from "../types/approvalViolation";

export type RuleMatch = { rule: ApprovalRule; conditions: ApprovalViolation[] };

/** Enabled rules on this action whose filter matches the request, whoever they name. */
export const findMatchingRules = ({
	rules,
	action,
	facts,
	context,
}: {
	rules: ApprovalRule[];
	action: ApprovalAction;
	facts: ApprovalFacts | null;
	context: FilterMatchContext;
}): RuleMatch[] =>
	rules
		.filter((rule) => rule.enabled && rule.actions.includes(action))
		.flatMap((rule) => {
			const { matches, conditions } = matchRuleFilter({
				rule,
				action,
				facts,
				context,
			});
			return matches ? [{ rule, conditions }] : [];
		});
