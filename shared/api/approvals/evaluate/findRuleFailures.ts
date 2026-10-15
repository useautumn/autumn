import { ACTIONS, type ApprovalAction } from "../actions/approvalActions";
import type { ApprovalRule } from "../schemas/approvalRule";
import type { ApprovalFacts } from "./facts/approvalFacts";
import type { ApprovalViolation } from "./types/approvalVerdict";
import { WHEN_FIELDS_BY_KEY } from "./when/areas/whenFieldsByKey";
import { findWhenFailures } from "./when/findWhenFailures";
import type { WhenFields, WhenMatchContext } from "./when/whenFieldTypes";

/** The rule's failed conditions for these facts; empty when the rule matches. */
export const findRuleFailures = ({
	rule,
	action,
	facts,
	context,
}: {
	rule: ApprovalRule;
	action: ApprovalAction;
	facts: ApprovalFacts | null;
	context: WhenMatchContext;
}): ApprovalViolation[] => {
	const whenKey = ACTIONS[action].when;
	if (!rule.when || !whenKey) return [];

	// `evaluateApprovalRules` types `facts` by action, so they fit this action's fields.
	const fields = WHEN_FIELDS_BY_KEY[
		whenKey
	] as WhenFields<ApprovalFacts | null>;
	return findWhenFailures({
		when: rule.when,
		value: facts,
		fields,
		path: "",
		context,
	});
};
