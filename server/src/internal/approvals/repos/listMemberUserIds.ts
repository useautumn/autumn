import { member } from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/**
 * Which of `userIds` are members of the org. The rows stay share-locked until the caller's
 * transaction ends, so a member removal can't finish between this check and the save.
 */
export const listMemberUserIds = async ({
	db,
	orgId,
	userIds,
}: {
	db: DrizzleCli;
	orgId: string;
	userIds: string[];
}): Promise<Set<string>> => {
	if (userIds.length === 0) return new Set();

	const rows = await db
		.select({ userId: member.userId })
		.from(member)
		.where(
			and(eq(member.organizationId, orgId), inArray(member.userId, userIds)),
		)
		.for("share");
	return new Set(rows.map((row) => row.userId));
};
