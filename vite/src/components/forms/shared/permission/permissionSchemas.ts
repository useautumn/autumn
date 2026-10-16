import { z } from "zod/v4";

// Mirrors E2 (#5105) `previewPermission.ts` and `PermissionDeniedError`; swap for the @autumn/shared exports once E2 is on this base.
const ViolationValueSchema = z.union([z.string(), z.boolean()]);

const DecidedBySchema = z.object({
	level: z.enum(["user", "role", "everyone"]),
	rule_id: z.string(),
	rule_name: z.string(),
});

/** `limit` is the condition as the rule states it, e.g. "< 2 months" or "pro or team". */
const ViolationSchema = z.object({
	field: z.string(),
	label: z.string(),
	limit: ViolationValueSchema,
	actual: ViolationValueSchema,
});

const DenialDetailsSchema = z.object({
	violations: z.array(ViolationSchema),
	decided_by: DecidedBySchema,
	/** Role ids whose own allow rule would win for this exact request. */
	allowed_roles: z.array(z.string()),
});

export const PreviewPermissionSchema = z.discriminatedUnion("verdict", [
	z.object({
		verdict: z.literal("allow"),
		enforced: z.boolean(),
		decided_by: DecidedBySchema,
	}),
	DenialDetailsSchema.extend({
		verdict: z.literal("deny"),
		enforced: z.boolean(),
		message: z.string(),
	}),
]);

export const PermissionDeniedErrorSchema = z.object({
	response: z.object({
		status: z.literal(403),
		data: z.object({
			code: z.literal("permission_denied"),
			message: z.string(),
			details: DenialDetailsSchema,
		}),
	}),
});

export type PermissionDenial = z.infer<typeof DenialDetailsSchema> & {
	message: string;
};
export type PermissionViolation = z.infer<typeof ViolationSchema>;
