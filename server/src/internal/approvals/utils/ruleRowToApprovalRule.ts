import type {
	ApprovalAction,
	ApprovalRule,
	ApprovalRuleWhen,
} from "@autumn/shared";
import type { ApprovalRuleWithSubjects } from "@autumn/shared/models/approvalModels/index";
import { rowToRuleSubject } from "./rowToRuleSubject.js";

/** Rows were validated with the rule schema on write, so their jsonb and text[] narrow safely. */
export const ruleRowToApprovalRule = ({
	row,
	userNames,
}: {
	row: ApprovalRuleWithSubjects;
	userNames: Map<string, string>;
}): ApprovalRule => ({
	id: row.id,
	name: row.name,
	subjects: row.subjects.map((subject) => rowToRuleSubject({ row: subject })),
	actions: row.actions as ApprovalAction[],
	when: row.when as ApprovalRuleWhen | null,
	note: row.note,
	enabled: row.enabled,
	version: row.version,
	updated_by: {
		user_id: row.updated_by,
		name: userNames.get(row.updated_by) ?? "",
	},
	created_at: row.created_at,
	updated_at: row.updated_at,
});
