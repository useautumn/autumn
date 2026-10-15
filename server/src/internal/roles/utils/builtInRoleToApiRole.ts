import {
	type ApiRole,
	type BUILT_IN_ROLES,
	ROLE_SCOPES,
	scopesToRoleAccess,
} from "@autumn/shared";

export const builtInRoleToApiRole = ({
	role,
	memberCount,
}: {
	role: (typeof BUILT_IN_ROLES)[number];
	memberCount: number;
}): ApiRole => ({
	name: role.name,
	label: role.label,
	built_in: true,
	access: scopesToRoleAccess({ scopes: ROLE_SCOPES[role.name] }),
	member_count: memberCount,
	created_at: null,
	updated_at: null,
});
