import { user } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Display names by user id, for `updated_by`; unknown ids are absent. */
export const listUserNames = async ({
	db,
	userIds,
}: {
	db: DrizzleCli;
	userIds: string[];
}): Promise<Map<string, string>> => {
	if (userIds.length === 0) return new Map();

	const rows = await db
		.select({ id: user.id, name: user.name })
		.from(user)
		.where(inArray(user.id, [...new Set(userIds)]));
	return new Map(rows.map((row) => [row.id, row.name]));
};
