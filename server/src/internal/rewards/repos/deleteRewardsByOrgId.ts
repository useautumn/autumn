import { type AppEnv, rewards } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Bulk delete all rewards for an org/env */
export const deleteRewardsByOrgId = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}) => {
	await db
		.delete(rewards)
		.where(and(eq(rewards.org_id, orgId), eq(rewards.env, env)));
};
