import type { ApprovalAction, ApprovalRuleWhen } from "@autumn/shared";
import type { ApprovalRuleVersion } from "@autumn/shared/api/approvals/crud/approvalRuleVersion";
import type { ApprovalRuleVersionRow } from "@autumn/shared/models/approvalModels/index";
import { rowToRuleSubject } from "./rowToRuleSubject.js";

export const versionRowToApprovalRuleVersion = ({
	row,
	userNames,
}: {
	row: ApprovalRuleVersionRow;
	userNames: Map<string, string>;
}): ApprovalRuleVersion => ({
	rule_id: row.rule_id,
	version: row.version,
	rule: {
		name: row.snapshot.name,
		subjects: row.snapshot.subjects.map((subject) =>
			rowToRuleSubject({ row: subject }),
		),
		actions: row.snapshot.actions as ApprovalAction[],
		when: row.snapshot.when as ApprovalRuleWhen | null,
		note: row.snapshot.note,
		enabled: row.snapshot.enabled,
	},
	updated_by: {
		user_id: row.created_by,
		name: userNames.get(row.created_by) ?? "",
	},
	created_at: row.created_at,
});
