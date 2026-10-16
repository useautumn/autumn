import type { approvalDecisions } from "./approvalDecisionTable.js";
import type {
	approvalRuleSubjects,
	approvalRules,
	approvalRuleVersions,
} from "./approvalRuleTable.js";

export type ApprovalSubjectType = "everyone" | "role" | "user";
export type ApprovalRuleEffect = "allow" | "block";
export type ApprovalDecisionVerdict = "allow" | "deny";

/** Stored shape of `decided_by` on a decision. */
export type ApprovalDecidedBy = {
	level: "user" | "role" | "everyone";
	rule_id: string;
	rule_name: string;
};

/** Stored shape of one decision violation. */
export type ApprovalViolationRow = {
	field: string;
	label: string;
	limit: unknown;
	actual: unknown;
};

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
	"name" | "effect" | "position" | "actions" | "filter" | "note" | "enabled"
> & {
	subjects: ApprovalRuleSubjectRow[];
};

/** A new rule; the repo appends it to the end of the list. */
export type InsertApprovalRule = Omit<ApprovalRuleSnapshot, "position"> & {
	id: string;
};

/** Fields to change on a rule. Position only changes through reorder. */
export type UpdateApprovalRule = Partial<
	Omit<ApprovalRuleSnapshot, "position">
> & { id: string };
