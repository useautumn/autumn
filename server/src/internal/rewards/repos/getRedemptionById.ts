import {
	ErrCode,
	RecaseError,
	type RewardRedemption,
	rewardRedemptions,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Fetch a redemption by ID. Throws if not found. */
export const getRedemptionById = async ({
	db,
	id,
}: {
	db: DrizzleCli;
	id: string;
}) => {
	const data = await db.query.rewardRedemptions.findFirst({
		where: eq(rewardRedemptions.id, id),
	});

	if (!data) {
		throw new RecaseError({
			code: ErrCode.RewardRedemptionNotFound,
			message: `Reward redemption ${id} not found`,
			statusCode: 404,
		});
	}

	return data as RewardRedemption;
};
