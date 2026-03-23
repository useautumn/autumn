import {
	ErrCode,
	RecaseError,
	type RewardProgram,
	rewardPrograms,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Insert a reward program. Throws on failure. */
export const insertRewardProgram = async ({
	db,
	data,
}: {
	db: DrizzleCli;
	data: RewardProgram | RewardProgram[];
}) => {
	const values = Array.isArray(data) ? data : [data];
	const result = await db.insert(rewardPrograms).values(values).returning();

	if (result.length === 0) {
		throw new RecaseError({
			message: "Failed to create reward program",
			code: ErrCode.InsertRewardProgramFailed,
		});
	}

	return result[0] as RewardProgram;
};
