import { type AppEnv, type FullReward, rewards } from "@autumn/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Fetch one reward by promo code */
export const getRewardByCode = async ({
	db,
	code,
	orgId,
	env,
	rewardInternalId,
}: {
	db: DrizzleCli;
	code: string;
	orgId: string;
	env: AppEnv;
	rewardInternalId?: string;
}) => {
	const result = await db.query.rewards.findFirst({
		where: and(
			eq(rewards.org_id, orgId),
			eq(rewards.env, env),
			rewardInternalId ? eq(rewards.internal_id, rewardInternalId) : undefined,
			sql`EXISTS (
				SELECT 1 FROM unnest(${rewards.promo_codes}) AS elem
				WHERE elem->>'code' = ${code}
			)`,
		),
		orderBy: desc(rewards.created_at),
		with: {
			entitlements: true,
		},
	});

	if (!result) {
		return null;
	}

	return result as FullReward;
};
