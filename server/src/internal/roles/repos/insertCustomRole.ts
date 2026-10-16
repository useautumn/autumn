import { CUSTOM_ROLE_AC_PERMISSION, organizationRole } from "@autumn/shared";
import type { CreateRoleParams } from "@autumn/shared/api/roles/apiRole";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";

export const insertCustomRole = async ({
	db,
	orgId,
	params,
}: {
	db: DrizzleCli;
	orgId: string;
	params: CreateRoleParams;
}) => {
	const [role] = await db
		.insert(organizationRole)
		.values({
			id: generateId("role"),
			organizationId: orgId,
			role: params.name,
			label: params.label,
			access: params.access,
			permission: CUSTOM_ROLE_AC_PERMISSION,
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.returning();
	return role;
};
