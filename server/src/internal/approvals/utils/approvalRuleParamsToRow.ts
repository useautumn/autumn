import type { ApprovalRuleParams } from "@autumn/shared";
import type { InsertApprovalRule } from "@autumn/shared/models/approvalModels/index";
import { ruleSubjectToRow } from "./ruleSubjectToRow.js";

export const approvalRuleParamsToRow = ({
	rule,
}: {
	rule: ApprovalRuleParams;
}): Omit<InsertApprovalRule, "id"> => ({
	name: rule.name,
	effect: rule.effect,
	actions: rule.actions,
	filter: rule.filter,
	note: rule.note,
	enabled: rule.enabled,
	subjects: rule.subjects.map((subject) => ruleSubjectToRow({ subject })),
});
