import type { approvalDecisions } from "./approvalDecisionTable.js";
import type {
	approvalRuleSubjects,
	approvalRules,
	approvalRuleVersions,
} from "./approvalRuleTable.js";

export type ApprovalSubjectType = "everyone" | "role" | "user";
export type ApprovalDecisionVerdict = "allow" | "deny";

/** `subject_id` for an "everyone" subject, which names no one; keeps the composite key non-null. */
export const EVERYONE_SUBJECT_ID = "*";

export type ApprovalRuleRow = typeof approvalRules.$inferSelect;
export type ApprovalRuleSubjectRow = Pick<
	typeof approvalRuleSubjects.$inferSelect,
	"subject_type" | "subject_id"
>;
export type ApprovalRuleVersionRow = typeof approvalRuleVersions.$inferSelect;
export type ApprovalDecisionRow = typeof approvalDecisions.$inferSelect;
export type InsertApprovalDecision = typeof approvalDecisions.$inferInsert;

export type ApprovalRuleWithSubjects = ApprovalRuleRow & {
	subjects: ApprovalRuleSubjectRow[];
};

/** A rule as saved at one version, for History and the decision log. */
export type ApprovalRuleSnapshot = Pick<
	ApprovalRuleRow,
	"name" | "actions" | "when" | "note" | "enabled"
> & {
	subjects: ApprovalRuleSubjectRow[];
};

/** The editable part of a rule; the repo sets version, authors and timestamps. */
export type UpsertApprovalRule = ApprovalRuleSnapshot & { id: string };
