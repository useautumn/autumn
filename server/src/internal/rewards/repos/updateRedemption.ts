import {
	ErrCode,
	RecaseError,
	type RewardRedemption,
	rewardRedemptions,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Update a reward redemption. Throws if not found. */
export const updateRedemption = async ({
	db,
	id,
	updates,
}: {
	db: DrizzleCli;
	id: string;
	updates: Partial<RewardRedemption>;
}) => {
	const data = await db
		.update(rewardRedemptions)
		.set(updates)
		.where(eq(rewardRedemptions.id, id))
		.returning();

	if (data.length === 0) {
		throw new RecaseError({
			code: ErrCode.RewardRedemptionNotFound,
			message: `Reward redemption ${id} not found`,
		});
	}

	return data[0] as RewardRedemption;
};
