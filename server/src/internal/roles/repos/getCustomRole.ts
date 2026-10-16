import { organizationRole } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const getCustomRole = async ({
	db,
	orgId,
	id,
}: {
	db: DrizzleCli;
	orgId: string;
	id: string;
}) => {
	const [role] = await db
		.select()
		.from(organizationRole)
		.where(
			and(
				eq(organizationRole.organizationId, orgId),
				eq(organizationRole.role, id),
			),
		);
	return role;
};
