import type { ApiRole, organizationRole } from "@autumn/shared";
import type { RoleUsage } from "../repos/getRoleUsage.js";

export const customRoleToApiRole = ({
	role,
	usage,
}: {
	role: typeof organizationRole.$inferSelect;
	usage: RoleUsage;
}): ApiRole => ({
	name: role.role,
	label: role.label,
	built_in: false,
	access: role.access,
	member_count: usage.members.get(role.role) ?? 0,
	rule_count: usage.rules.get(role.role) ?? 0,
	created_at: role.createdAt.getTime(),
	updated_at: role.updatedAt?.getTime() ?? null,
});
