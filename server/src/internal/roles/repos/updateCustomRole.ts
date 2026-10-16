import { organizationRole } from "@autumn/shared";
import type { UpdateRoleParams } from "@autumn/shared/api/roles/apiRole";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Changes a custom role's name and access; its id never changes. Undefined if it's gone. */
export const updateCustomRole = async ({
	db,
	orgId,
	params,
}: {
	db: DrizzleCli;
	orgId: string;
	params: UpdateRoleParams;
}) => {
	const [role] = await db
		.update(organizationRole)
		.set({ label: params.name, access: params.access, updatedAt: new Date() })
		.where(
			and(
				eq(organizationRole.organizationId, orgId),
				eq(organizationRole.role, params.id),
			),
		)
		.returning();
	return role;
};
