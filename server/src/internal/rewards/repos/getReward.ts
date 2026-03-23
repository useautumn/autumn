import { type AppEnv, type Reward, rewards } from "@autumn/shared";
import { and, eq, or } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Fetch one reward by ID or internal_id */
export const getReward = async ({
	db,
	idOrInternalId,
	orgId,
	env,
}: {
	db: DrizzleCli;
	idOrInternalId: string;
	orgId: string;
	env: AppEnv;
}) => {
	const result = await db.query.rewards.findFirst({
		where: and(
			or(
				eq(rewards.id, idOrInternalId),
				eq(rewards.internal_id, idOrInternalId),
			),
			eq(rewards.org_id, orgId),
			eq(rewards.env, env),
		),
	});

	if (!result) {
		return null;
	}

	return result as Reward;
};
