import {
	type ApprovalRuleWithSubjects,
	approvalRuleVersions,
} from "@autumn/shared/models/approvalModels/index";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Snapshots a rule as just saved, for History and the decision log. */
export const insertRuleVersion = async ({
	db,
	rule,
	userId,
}: {
	db: DrizzleCli;
	rule: ApprovalRuleWithSubjects;
	userId: string;
}) => {
	await db.insert(approvalRuleVersions).values({
		rule_id: rule.id,
		org_id: rule.org_id,
		version: rule.version,
		snapshot: {
			name: rule.name,
			effect: rule.effect,
			position: rule.position,
			actions: rule.actions,
			filter: rule.filter,
			note: rule.note,
			enabled: rule.enabled,
			subjects: rule.subjects,
		},
		created_by: userId,
	});
};
