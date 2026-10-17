import { organizationRole } from "@autumn/shared";
import { asc, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const listCustomRoles = async ({
	db,
	orgId,
}: {
	db: DrizzleCli;
	orgId: string;
}) =>
	db
		.select()
		.from(organizationRole)
		.where(eq(organizationRole.organizationId, orgId))
		.orderBy(asc(organizationRole.label));
