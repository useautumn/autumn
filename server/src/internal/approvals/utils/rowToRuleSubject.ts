import type { ApprovalRuleSubjectRow, RuleSubject } from "@autumn/shared";

export const rowToRuleSubject = ({
	row,
}: {
	row: ApprovalRuleSubjectRow;
}): RuleSubject => {
	if (row.subject_type === "role")
		return { type: "role", role: row.subject_id };
	if (row.subject_type === "user") {
		return { type: "user", user_id: row.subject_id };
	}
	return { type: "everyone" };
};
