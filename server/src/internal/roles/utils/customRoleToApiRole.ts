import type { organizationRole } from "@autumn/shared";
import type { ApiRole } from "@autumn/shared/api/roles/apiRole";
import type { RoleUsage } from "../repos/getRoleUsage.js";

export const customRoleToApiRole = ({
	role,
	usage,
}: {
	role: typeof organizationRole.$inferSelect;
	usage: RoleUsage;
}): ApiRole => ({
	id: role.role,
	name: role.label,
	built_in: false,
	access: role.access,
	member_count: usage.members.get(role.role) ?? 0,
	rule_count: usage.rules.get(role.role) ?? 0,
});
