import type { ApprovalRule } from "../../schemas/approvalRule";
import type { RuleSubject } from "../../schemas/ruleSubject";
import type { ApprovalPrincipal } from "../types/approvalPrincipal";
import { APPROVAL_LEVELS, type ApprovalLevel } from "../types/approvalVerdict";

const subjectNamesPrincipalAt = ({
	subject,
	level,
	principal,
}: {
	subject: RuleSubject;
	level: ApprovalLevel;
	principal: ApprovalPrincipal;
}) => {
	if (level === "user")
		return subject.type === "user" && subject.user_id === principal.user_id;
	if (level === "role")
		return subject.type === "role" && subject.role_id === principal.role_id;
	return subject.type === "everyone";
};

/**
 * The most specific level at which the rule names this person, or null if it
 * doesn't. A rule naming Everyone and Sales counts at the role level for Sales.
 */
export const ruleLevelForPrincipal = ({
	rule,
	principal,
}: {
	rule: Pick<ApprovalRule, "subjects">;
	principal: ApprovalPrincipal;
}): ApprovalLevel | null =>
	APPROVAL_LEVELS.find((level) =>
		rule.subjects.some((subject) =>
			subjectNamesPrincipalAt({ subject, level, principal }),
		),
	) ?? null;
