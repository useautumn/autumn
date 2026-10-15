import { organizationRole } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const deleteCustomRole = async ({
	db,
	orgId,
	name,
}: {
	db: DrizzleCli;
	orgId: string;
	name: string;
}) => {
	await db
		.delete(organizationRole)
		.where(
			and(
				eq(organizationRole.organizationId, orgId),
				eq(organizationRole.role, name),
			),
		);
};
