import type { RuleSubject } from "@autumn/shared";
import {
	type ApprovalRuleSubjectRow,
	EVERYONE_SUBJECT_ID,
} from "@autumn/shared/models/approvalModels/index";

export const ruleSubjectToRow = ({
	subject,
}: {
	subject: RuleSubject;
}): ApprovalRuleSubjectRow => {
	if (subject.type === "role") {
		return { subject_type: "role", subject_id: subject.role };
	}
	if (subject.type === "user") {
		return { subject_type: "user", subject_id: subject.user_id };
	}
	return { subject_type: "everyone", subject_id: EVERYONE_SUBJECT_ID };
};
