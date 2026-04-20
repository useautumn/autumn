import { rewardRedemptions } from "@autumn/shared";
import { and, count, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Count triggered redemptions for a referral code */
export const getReferralCodeRedemptionCount = async ({
	db,
	referralCodeId,
}: {
	db: DrizzleCli;
	referralCodeId: string;
}) => {
	const result = await db
		.select({ count: count() })
		.from(rewardRedemptions)
		.where(
			and(
				eq(rewardRedemptions.referral_code_id, referralCodeId),
				eq(rewardRedemptions.triggered, true),
			),
		);

	return result[0].count;
};
