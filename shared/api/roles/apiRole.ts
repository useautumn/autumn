import { z } from "zod/v4";
import { RoleAccessMapSchema } from "./roleAccess.js";

/** A role as the API returns it: `id` is the slug members and rules store, `name` the display name. */
export const ApiRoleSchema = z.object({
	id: z.string(),
	name: z.string(),
	built_in: z.boolean(),
	access: RoleAccessMapSchema,
	member_count: z.number(),
	/** Enabled approval rules that name this role. */
	rule_count: z.number(),
});
export type ApiRole = z.infer<typeof ApiRoleSchema>;

export const RoleIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,62}$/, {
	message: "Role ids are lowercase letters, numbers, hyphens and underscores.",
});

export const CreateRoleParamsSchema = z.object({
	id: RoleIdSchema,
	name: z.string().trim().min(1),
	access: RoleAccessMapSchema,
});
export type CreateRoleParams = z.infer<typeof CreateRoleParamsSchema>;

/** Role ids are fixed once created; only the name and access can change. */
export const UpdateRoleParamsSchema = z.object({
	id: z.string(),
	name: z.string().trim().min(1).optional(),
	access: RoleAccessMapSchema.optional(),
});
export type UpdateRoleParams = z.infer<typeof UpdateRoleParamsSchema>;

export const RoleIdParamsSchema = z.object({ id: z.string() });
export const ListRolesParamsSchema = z.object({});
