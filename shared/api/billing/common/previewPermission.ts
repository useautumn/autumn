import { z } from "zod/v4";

const ViolationValueSchema = z.union([z.string(), z.boolean()]);

const PermissionDecidedBySchema = z.object({
	level: z.enum(["user", "role", "everyone"]),
	rule_id: z.string(),
	rule_name: z.string(),
});

/** False in shadow mode: a deny is logged but the write still goes through. */
const enforcedField = {
	enforced: z.boolean(),
};

/** The approval rules' verdict on a previewed request. Omitted when no rule matches it. */
export const PreviewPermissionSchema = z.discriminatedUnion("verdict", [
	z.object({
		verdict: z.literal("allow"),
		decided_by: PermissionDecidedBySchema,
		...enforcedField,
	}),
	z.object({
		verdict: z.literal("deny"),
		...enforcedField,
		message: z.string(),
		/** The deciding block rule's conditions that this request matched. */
		violations: z.array(
			z.object({
				field: z.string(),
				label: z.string(),
				limit: ViolationValueSchema,
				actual: ViolationValueSchema,
			}),
		),
		decided_by: PermissionDecidedBySchema,
		/** Role ids whose own allow rule would win for this exact request. */
		allowed_roles: z.array(z.string()),
	}),
]);

export type PreviewPermission = z.infer<typeof PreviewPermissionSchema>;
