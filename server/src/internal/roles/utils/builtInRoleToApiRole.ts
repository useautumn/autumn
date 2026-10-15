import {
	type ApiRole,
	type BUILT_IN_ROLES,
	ROLE_SCOPES,
	scopesToRoleAccess,
} from "@autumn/shared";
import type { RoleUsage } from "../repos/getRoleUsage.js";

export const builtInRoleToApiRole = ({
	role,
	usage,
}: {
	role: (typeof BUILT_IN_ROLES)[number];
	usage: RoleUsage;
}): ApiRole => ({
	name: role.name,
	label: role.label,
	built_in: true,
	access: scopesToRoleAccess({ scopes: ROLE_SCOPES[role.name] }),
	member_count: usage.members.get(role.name) ?? 0,
	rule_count: usage.rules.get(role.name) ?? 0,
	created_at: null,
	updated_at: null,
});
