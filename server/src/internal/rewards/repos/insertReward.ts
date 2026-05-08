import { type Reward, rewards } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Insert one or many rewards */
export const insertReward = async ({
	db,
	data,
}: {
	db: DrizzleCli;
	data: Reward | Reward[];
}) => {
	const results = await db.insert(rewards).values(data as Reward);
	return results as Reward[];
};
