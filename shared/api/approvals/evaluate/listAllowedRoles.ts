import type { ApprovalAction } from "../actions/approvalActions";
import type { ApprovalRule } from "../schemas/approvalRule";
import type { ApprovalFacts } from "./facts/approvalFacts";
import { findRuleFailures } from "./findRuleFailures";
import { EXEMPT_ROLES } from "./types/approvalPrincipal";
import type { WhenMatchContext } from "./when/whenFieldTypes";

/** Owner, Admin, and every role named by a rule that would allow these facts. Names only. */
export const listAllowedRoles = ({
	rules,
	action,
	facts,
	context,
}: {
	rules: ApprovalRule[];
	action: ApprovalAction;
	facts: ApprovalFacts | null;
	context: WhenMatchContext;
}): string[] => {
	const allowingRoles = rules
		.filter(
			(rule) => findRuleFailures({ rule, action, facts, context }).length === 0,
		)
		.flatMap((rule) =>
			rule.subjects.flatMap((subject) =>
				subject.type === "role" ? [subject.role] : [],
			),
		);
	return [...new Set([...EXEMPT_ROLES, ...allowingRoles])];
};
