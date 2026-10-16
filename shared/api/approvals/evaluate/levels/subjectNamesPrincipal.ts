import type { RuleSubject } from "../../schemas/ruleSubject";
import type { ApprovalUserPrincipal } from "../types/approvalPrincipal";
import type { ApprovalLevel } from "../types/approvalVerdict";

/** Does `subject` name this principal at `level` (their user id, their role, or everyone)? */
export const subjectNamesPrincipal = ({
	subject,
	level,
	principal,
}: {
	subject: RuleSubject;
	level: ApprovalLevel;
	principal: ApprovalUserPrincipal;
}) => {
	if (level === "user") {
		return subject.type === "user" && subject.user_id === principal.user_id;
	}
	if (level === "role") {
		return subject.type === "role" && subject.role === principal.role;
	}
	return subject.type === "everyone";
};
