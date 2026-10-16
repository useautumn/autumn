import { z } from "zod/v4";
import { ApprovalActionSchema } from "../actions/approvalActions";
import { checkRuleActionsAndWhen } from "./checkRuleActionsAndWhen";
import { isPlainObject } from "./isPlainObject";
import { RuleSubjectSchema } from "./ruleSubject";
import type { ApprovalRuleWhen } from "./when/whenSchemas";

// Typed as the union; `checkRuleActionsAndWhen` parses it against the actions' area.
const RuleWhenSchema = z
	.custom<ApprovalRuleWhen>(isPlainObject, {
		message: "Conditions must be an object.",
	})
	.nullable();

const ruleFields = {
	name: z.string().trim().min(1),
	subjects: z.array(RuleSubjectSchema).min(1),
	actions: z.array(ApprovalActionSchema).min(1),
	when: RuleWhenSchema.default(null),
	note: z.string().nullable().default(null),
	enabled: z.boolean().default(true),
};

export const CreateApprovalRuleParamsSchema = z
	.object(ruleFields)
	.superRefine(checkRuleActionsAndWhen);

export type CreateApprovalRuleParams = z.input<
	typeof CreateApprovalRuleParamsSchema
>;

/** Create params after parsing: defaults applied. */
export type ApprovalRuleParams = z.output<
	typeof CreateApprovalRuleParamsSchema
>;

export const ApprovalRuleSchema = z
	.object({
		...ruleFields,
		id: z.string(),
		version: z.number().int().positive(),
		updated_by: z.object({ user_id: z.string(), name: z.string() }),
		created_at: z.number(),
		updated_at: z.number(),
	})
	.superRefine(checkRuleActionsAndWhen);

export type ApprovalRule = z.infer<typeof ApprovalRuleSchema>;
