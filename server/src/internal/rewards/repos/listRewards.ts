import {
	type AppEnv,
	type Reward,
	type RewardType,
	rewards,
} from "@autumn/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** List rewards for an org/env, optionally filtered by type */
export const listRewards = async ({
	db,
	orgId,
	env,
	inTypes,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	inTypes?: RewardType[];
}) => {
	const results = await db.query.rewards.findMany({
		where: and(
			eq(rewards.org_id, orgId),
			eq(rewards.env, env),
			inTypes ? inArray(rewards.type, inTypes) : undefined,
		),
		orderBy: [desc(rewards.internal_id)],
	});

	return results as Reward[];
};
