import { relations } from "drizzle-orm";
import { approvalRuleSubjects, approvalRules } from "./approvalRuleTable.js";

export const approvalRulesRelations = relations(approvalRules, ({ many }) => ({
	subjects: many(approvalRuleSubjects),
}));

export const approvalRuleSubjectsRelations = relations(
	approvalRuleSubjects,
	({ one }) => ({
		rule: one(approvalRules, {
			fields: [approvalRuleSubjects.rule_id],
			references: [approvalRules.id],
		}),
	}),
);
