import { z } from "zod/v4";

// Mirrors E1's preview `permission` and 403 body (PRD §3); swap for the @autumn/shared exports once E1 freezes.
const ViolationValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const DecidedBySchema = z.object({
	level: z.enum(["user", "role", "everyone"]),
	rule_id: z.string(),
	rule_name: z.string(),
});

const ViolationSchema = z.object({
	field: z.string(),
	label: z.string(),
	operator: z.string().optional(),
	limit: ViolationValueSchema,
	actual: ViolationValueSchema,
});

const DenialDetailsSchema = z.object({
	violations: z.array(ViolationSchema),
	decided_by: DecidedBySchema,
	allowed_roles: z.array(z.string()),
});

export const PreviewPermissionSchema = z.discriminatedUnion("verdict", [
	z.object({
		verdict: z.literal("allow"),
		enforced: z.boolean().optional(),
		decided_by: DecidedBySchema.nullable(),
	}),
	DenialDetailsSchema.extend({
		verdict: z.literal("deny"),
		enforced: z.boolean().optional(),
		message: z.string(),
	}),
]);

export const PermissionDeniedErrorSchema = z.object({
	response: z.object({
		status: z.literal(403),
		data: z.object({
			code: z.literal("permission_denied"),
			message: z.string(),
			env: z.string(),
			details: DenialDetailsSchema,
		}),
	}),
});

export type PermissionDenial = z.infer<typeof DenialDetailsSchema> & {
	message: string;
};
export type PermissionViolation = z.infer<typeof ViolationSchema>;
