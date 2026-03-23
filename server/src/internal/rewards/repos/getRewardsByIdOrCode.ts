import { type AppEnv, type Reward, rewards } from "@autumn/shared";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Fetch rewards matching an array of IDs or promo code strings */
export const getRewardsByIdOrCode = async ({
	db,
	codes,
	orgId,
	env,
}: {
	db: DrizzleCli;
	codes: string[];
	orgId: string;
	env: AppEnv;
}) => {
	const reward = await db.query.rewards.findMany({
		where: and(
			eq(rewards.org_id, orgId),
			eq(rewards.env, env),
			or(
				inArray(rewards.id, codes),
				...codes.map(
					(code) => sql`EXISTS (
            SELECT 1 FROM unnest("promo_codes") AS elem
            WHERE elem->>'code' = ${code}
          )`,
				),
			),
		),
	});

	return reward as Reward[];
};
