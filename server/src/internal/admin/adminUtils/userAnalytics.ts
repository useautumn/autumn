import { user } from "@autumn/shared";
import { count } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

// Required stats (by interval):
// 1. User count
// 2. Retained count
// 3. Churned count

export const getUserCount = async ({ db }: { db: DrizzleCli }) => {
	const userCount = await db.select({ count: count() }).from(user);
	return userCount[0].count;
};
