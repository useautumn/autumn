import { member } from "@autumn/shared";
import { count, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Member count per role name in an org; roles with no members are absent. */
export const countMembersByRole = async ({
	db,
	orgId,
}: {
	db: DrizzleCli;
	orgId: string;
}): Promise<Map<string, number>> => {
	const rows = await db
		.select({ role: member.role, count: count() })
		.from(member)
		.where(eq(member.organizationId, orgId))
		.groupBy(member.role);
	return new Map(rows.map((row) => [row.role, row.count]));
};
