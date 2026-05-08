import { entitlements, type Reward, rewards } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	type RewardWithEntitlementInputs,
	rewardToEntitlementRows,
} from "./rewardEntitlementRows.js";

/** Insert one or many rewards */
export const insertReward = async ({
	db,
	data,
}: {
	db: DrizzleCli;
	data: RewardWithEntitlementInputs | RewardWithEntitlementInputs[];
}) => {
	const rewardsToInsert = Array.isArray(data) ? data : [data];
	const rewardData = rewardsToInsert.map((reward) => {
		const { entitlements: _entitlements, ...rewardRow } = reward;
		return rewardRow;
	});
	const entitlementRows = rewardsToInsert.flatMap((reward) =>
		rewardToEntitlementRows({ reward }),
	);

	const insertedRewards = await db
		.insert(rewards)
		.values(rewardData)
		.returning();

	if (entitlementRows.length > 0) {
		await db.insert(entitlements).values(entitlementRows);
	}

	return insertedRewards.map((reward) => ({
		...reward,
		entitlements: entitlementRows.filter(
			(entitlement) => entitlement.internal_reward_id === reward.internal_id,
		),
	})) as Reward[];
};
