import { z } from "zod/v4";
import { RESOURCES } from "../../utils/scopeDefinitions.js";

export const RoleAccessSchema = z.enum(["none", "read", "write"]);
export type RoleAccess = z.infer<typeof RoleAccessSchema>;

/** Coarse access per resource; every resource in `RESOURCES` must be set. */
export const RoleAccessMapSchema = z
	.object(
		Object.fromEntries(
			RESOURCES.map((resource) => [resource, RoleAccessSchema]),
		) as {
			[R in (typeof RESOURCES)[number]]: typeof RoleAccessSchema;
		},
	)
	.refine((access) => access.analytics !== "write", {
		message: "Analytics access is read-only.",
		path: ["analytics"],
	})
	// A role with no scopes would hit the scope check's legacy fail-open and allow everything.
	.refine((access) => Object.values(access).some((level) => level !== "none"), {
		message: "A role needs access to at least one resource.",
	});
export type RoleAccessMap = z.infer<typeof RoleAccessMapSchema>;

export const ApiRoleSchema = z.object({
	name: z.string(),
	label: z.string(),
	built_in: z.boolean(),
	access: RoleAccessMapSchema,
	member_count: z.number(),
	/** Enabled approval rules that name this role. */
	rule_count: z.number(),
	created_at: z.number().nullable(),
	updated_at: z.number().nullable(),
});
export type ApiRole = z.infer<typeof ApiRoleSchema>;

const RoleNameSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,62}$/, {
	message:
		"Role names are lowercase letters, numbers, hyphens and underscores.",
});

export const CreateRoleParamsSchema = z.object({
	name: RoleNameSchema,
	label: z.string().trim().min(1),
	access: RoleAccessMapSchema,
});
export type CreateRoleParams = z.infer<typeof CreateRoleParamsSchema>;

export const UpdateRoleParamsSchema = CreateRoleParamsSchema.partial();
export type UpdateRoleParams = z.infer<typeof UpdateRoleParamsSchema>;
