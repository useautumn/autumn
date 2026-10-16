import { z } from "zod/v4";
import { ApprovalActionSchema } from "../actions/approvalActions";
import { ApprovalRuleFilterSchema } from "./filters/approvalFilterShapes";
import { RuleSubjectSchema } from "./ruleSubject";

export const ApprovalRuleEffectSchema = z.enum(["allow", "block"]);
export type ApprovalRuleEffect = z.infer<typeof ApprovalRuleEffectSchema>;

// No refinements here: `validateApprovalRule` does the area checks, so a stored
// rule saved under older checks still reads back instead of failing to parse.
const ruleFields = {
	name: z.string().trim().min(1),
	effect: ApprovalRuleEffectSchema,
	subjects: z.array(RuleSubjectSchema).min(1),
	actions: z.array(ApprovalActionSchema).min(1),
	filter: ApprovalRuleFilterSchema.nullable().default(null),
	note: z.string().nullable().default(null),
	enabled: z.boolean().default(true),
};

/** Body of `approval_rules.create`. The server appends the rule to the end of the list. */
export const CreateApprovalRuleParamsSchema = z.object(ruleFields);
export type CreateApprovalRuleParams = z.input<
	typeof CreateApprovalRuleParamsSchema
>;
export type ApprovalRuleParams = z.output<
	typeof CreateApprovalRuleParamsSchema
>;

/** Body of `approval_rules.update`: the fields to change. */
export const UpdateApprovalRuleParamsSchema = z.object({
	id: z.string().min(1),
	name: ruleFields.name.optional(),
	effect: ruleFields.effect.optional(),
	subjects: ruleFields.subjects.optional(),
	actions: ruleFields.actions.optional(),
	filter: ApprovalRuleFilterSchema.nullable().optional(),
	note: z.string().nullable().optional(),
	enabled: z.boolean().optional(),
});
export type UpdateApprovalRuleParams = z.input<
	typeof UpdateApprovalRuleParamsSchema
>;

/** Body of `approval_rules.get`, `.delete` and `.versions.list`. */
export const ApprovalRuleIdParamsSchema = z.object({ id: z.string().min(1) });

/** Body of `approval_rules.list`. */
export const ListApprovalRulesParamsSchema = z.object({}).default({});

/** Body of `approval_rules.reorder`: every rule id, in the new order. */
export const ReorderApprovalRulesParamsSchema = z.object({
	ids: z.array(z.string().min(1)).min(1),
});

/** What a rule looked like at one version. */
export const ApprovalRuleSnapshotSchema = z.object({
	...ruleFields,
	position: z.number().int().nonnegative(),
});

const UpdatedBySchema = z.object({ user_id: z.string(), name: z.string() });

/** A rule as the API returns it. */
export const ApprovalRuleSchema = ApprovalRuleSnapshotSchema.extend({
	id: z.string(),
	version: z.number().int().positive(),
	updated_by: UpdatedBySchema,
	created_at: z.number(),
	updated_at: z.number(),
});
export type ApprovalRule = z.infer<typeof ApprovalRuleSchema>;

export const ApprovalRuleVersionSchema = z.object({
	rule_id: z.string(),
	version: z.number().int().positive(),
	rule: ApprovalRuleSnapshotSchema,
	updated_by: UpdatedBySchema,
	created_at: z.number(),
});
export type ApprovalRuleVersion = z.infer<typeof ApprovalRuleVersionSchema>;
