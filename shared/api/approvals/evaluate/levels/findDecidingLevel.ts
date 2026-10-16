import type { ApprovalRule } from "../../schemas/approvalRule";
import type { ApprovalUserPrincipal } from "../types/approvalPrincipal";
import { APPROVAL_LEVELS, type ApprovalLevel } from "../types/approvalVerdict";
import { subjectNamesPrincipal } from "./subjectNamesPrincipal";

/** The most specific level with any rule naming the principal, and that level's rules. */
export const findDecidingLevel = ({
	principal,
	rules,
}: {
	principal: ApprovalUserPrincipal;
	rules: ApprovalRule[];
}): { level: ApprovalLevel; rules: ApprovalRule[] } | null => {
	for (const level of APPROVAL_LEVELS) {
		const levelRules = rules.filter((rule) =>
			rule.subjects.some((subject) =>
				subjectNamesPrincipal({ subject, level, principal }),
			),
		);
		if (levelRules.length > 0) return { level, rules: levelRules };
	}
	return null;
};
