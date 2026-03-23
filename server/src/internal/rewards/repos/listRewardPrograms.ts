import { type RewardProgram, rewardPrograms } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** List all reward programs for an org/env */
export const listRewardPrograms = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId: string;
	env: string;
}) => {
	const result = await db.query.rewardPrograms.findMany({
		where: and(eq(rewardPrograms.org_id, orgId), eq(rewardPrograms.env, env)),
	});

	return result as RewardProgram[];
};
