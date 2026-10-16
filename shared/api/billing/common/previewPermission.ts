import { z } from "zod/v4";

const ViolationValueSchema = z.union([z.string(), z.boolean()]);

const PermissionDecidedBySchema = z.object({
	level: z.enum(["user", "role", "everyone"]),
	rule_id: z.string(),
	rule_name: z.string(),
});

/** The approval rules' verdict on a previewed request (the evaluator's allow / deny). */
export const PreviewPermissionSchema = z.discriminatedUnion("verdict", [
	z.object({
		verdict: z.literal("allow"),
		decided_by: PermissionDecidedBySchema.nullable(),
	}),
	z.object({
		verdict: z.literal("deny"),
		violations: z.array(
			z.object({
				field: z.string(),
				label: z.string(),
				limit: ViolationValueSchema,
				actual: ViolationValueSchema,
			}),
		),
		decided_by: PermissionDecidedBySchema,
		allowed_roles: z.array(z.string()),
		message: z.string(),
	}),
]);

export type PreviewPermission = z.infer<typeof PreviewPermissionSchema>;
