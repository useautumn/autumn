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
	id: role.id,
	name: role.name,
	built_in: true,
	access: scopesToRoleAccess({ scopes: ROLE_SCOPES[role.id] }),
	member_count: usage.members.get(role.id) ?? 0,
	rule_count: usage.rules.get(role.id) ?? 0,
});
