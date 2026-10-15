import type { RuleSubject } from "@autumn/shared";
import type { ApprovalRuleSubjectRow } from "@autumn/shared/models/approvalModels/index";

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
