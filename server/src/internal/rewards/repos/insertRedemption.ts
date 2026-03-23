import {
	ErrCode,
	RecaseError,
	type RewardRedemption,
	rewardRedemptions,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Insert a reward redemption. Throws on failure. */
export const insertRedemption = async ({
	db,
	rewardRedemption,
}: {
	db: DrizzleCli;
	rewardRedemption: RewardRedemption;
}) => {
	const data = await db
		.insert(rewardRedemptions)
		.values(rewardRedemption)
		.returning();

	if (data.length === 0) {
		throw new RecaseError({
			code: ErrCode.InsertRewardRedemptionFailed,
			message: "Failed to insert reward redemption",
			statusCode: 500,
		});
	}

	return data[0] as RewardRedemption;
};
