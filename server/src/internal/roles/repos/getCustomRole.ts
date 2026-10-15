import { organizationRole } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const getCustomRole = async ({
	db,
	orgId,
	name,
}: {
	db: DrizzleCli;
	orgId: string;
	name: string;
}) => {
	const [role] = await db
		.select()
		.from(organizationRole)
		.where(
			and(
				eq(organizationRole.organizationId, orgId),
				eq(organizationRole.role, name),
			),
		);
	return role;
};
