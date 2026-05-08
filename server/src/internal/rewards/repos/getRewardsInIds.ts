import { type AppEnv, type Reward, rewards } from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Fetch rewards by array of IDs */
export const getRewardsInIds = async ({
	db,
	ids,
	orgId,
	env,
}: {
	db: DrizzleCli;
	ids: string[];
	orgId: string;
	env: AppEnv;
}) => {
	return (await db.query.rewards.findMany({
		where: and(
			inArray(rewards.id, ids),
			eq(rewards.org_id, orgId),
			eq(rewards.env, env),
		),
	})) as Reward[];
};
