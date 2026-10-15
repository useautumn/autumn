import { z } from "zod/v4";
import { ApprovalActionSchema } from "../actions/approvalActions";
import { RuleSubjectSchema } from "../schemas/ruleSubject";
import type { ApprovalRuleWhen } from "../schemas/when/whenSchemas";

/** One saved version of a rule, for History: the rule as it was, and who saved it. */
export const ApprovalRuleVersionSchema = z.object({
	rule_id: z.string(),
	version: z.number().int().positive(),
	rule: z.object({
		name: z.string(),
		subjects: z.array(RuleSubjectSchema),
		actions: z.array(ApprovalActionSchema),
		when: z.custom<ApprovalRuleWhen>().nullable(),
		note: z.string().nullable(),
		enabled: z.boolean(),
	}),
	updated_by: z.object({ user_id: z.string(), name: z.string() }),
	created_at: z.number(),
});

export type ApprovalRuleVersion = z.infer<typeof ApprovalRuleVersionSchema>;
