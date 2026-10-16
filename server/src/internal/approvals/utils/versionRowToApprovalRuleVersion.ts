import type {
	ApprovalAction,
	ApprovalRuleFilter,
	ApprovalRuleVersion,
} from "@autumn/shared";
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
		effect: row.snapshot.effect,
		position: row.snapshot.position,
		subjects: row.snapshot.subjects.map((subject) =>
			rowToRuleSubject({ row: subject }),
		),
		actions: row.snapshot.actions as ApprovalAction[],
		filter: row.snapshot.filter as ApprovalRuleFilter | null,
		note: row.snapshot.note,
		enabled: row.snapshot.enabled,
	},
	updated_by: {
		user_id: row.created_by,
		name: userNames.get(row.created_by) ?? "",
	},
	created_at: row.created_at,
});
