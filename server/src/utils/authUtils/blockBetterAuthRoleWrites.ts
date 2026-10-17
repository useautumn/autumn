import { APIError, createAuthMiddleware } from "better-auth/api";

/** Paths of better-auth's own role writes, which would skip member and rule-subject updates. */
const ROLE_WRITE_PATHS = new Set([
	"/organization/create-role",
	"/organization/update-role",
	"/organization/delete-role",
]);

/** Roles are managed only through Autumn's roles.* routes; read-only role endpoints stay open. */
export const blockBetterAuthRoleWrites = createAuthMiddleware(async (ctx) => {
	if (!ROLE_WRITE_PATHS.has(ctx.path)) return;

	throw new APIError("FORBIDDEN", {
		code: "ROLES_MANAGED_BY_AUTUMN",
		message: "Manage roles with Autumn's roles.* routes.",
	});
});
