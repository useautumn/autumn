import { ROLE_SCOPES } from "@autumn/shared";
import type { ApiRole } from "@autumn/shared/api/roles/apiRole";
import type { BUILT_IN_ROLES } from "@autumn/shared/utils/roleUtils/builtInRoles";
import { scopesToRoleAccess } from "@autumn/shared/utils/roleUtils/scopesToRoleAccess";
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
