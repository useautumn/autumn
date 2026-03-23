import {
	type RewardProgram,
	RewardTriggerEvent,
	rewardPrograms,
} from "@autumn/shared";
import { and, arrayContains, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Find checkout-triggered reward programs matching product IDs */
export const getRewardProgramsByProductId = async ({
	db,
	productIds,
	orgId,
	env,
}: {
	db: DrizzleCli;
	productIds: string[];
	orgId: string;
	env: string;
}) => {
	const result = await db.query.rewardPrograms.findMany({
		where: and(
			eq(rewardPrograms.org_id, orgId),
			eq(rewardPrograms.env, env),
			eq(rewardPrograms.when, RewardTriggerEvent.Checkout),
			arrayContains(rewardPrograms.product_ids, productIds),
		),
	});

	return result as RewardProgram[];
};
