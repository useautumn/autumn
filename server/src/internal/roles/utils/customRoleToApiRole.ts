import type { ApiRole, organizationRole } from "@autumn/shared";

export const customRoleToApiRole = ({
	role,
	memberCount,
}: {
	role: typeof organizationRole.$inferSelect;
	memberCount: number;
}): ApiRole => ({
	name: role.role,
	label: role.label,
	built_in: false,
	access: role.access,
	member_count: memberCount,
	created_at: role.createdAt.getTime(),
	updated_at: role.updatedAt?.getTime() ?? null,
});
