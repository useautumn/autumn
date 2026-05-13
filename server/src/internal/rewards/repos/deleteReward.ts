import { type AppEnv, rewards } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Delete a reward by internal_id */
export const deleteReward = async ({
	db,
	internalId,
	env,
	orgId,
}: {
	db: DrizzleCli;
	internalId: string;
	env: AppEnv;
	orgId: string;
}) => {
	await db
		.delete(rewards)
		.where(
			and(
				eq(rewards.internal_id, internalId),
				eq(rewards.env, env),
				eq(rewards.org_id, orgId),
			),
		);
};
