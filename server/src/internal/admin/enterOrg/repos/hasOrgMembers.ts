import { member } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const hasOrgMembers = async ({
	db,
	orgId,
}: {
	db: DrizzleCli;
	orgId: string;
}) => {
	const [row] = await db
		.select({ id: member.id })
		.from(member)
		.where(eq(member.organizationId, orgId))
		.limit(1);

	return row !== undefined;
};
