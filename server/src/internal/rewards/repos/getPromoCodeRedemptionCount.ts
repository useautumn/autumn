import { rewardRedemptions } from "@autumn/shared";
import { and, count, eq, isNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Count promo code redemptions for a reward (excludes referral redemptions) */
export const getPromoCodeRedemptionCount = async ({
	db,
	rewardInternalId,
}: {
	db: DrizzleCli;
	rewardInternalId: string;
}) => {
	const result = await db
		.select({ count: count() })
		.from(rewardRedemptions)
		.where(
			and(
				eq(rewardRedemptions.reward_internal_id, rewardInternalId),
				isNull(rewardRedemptions.referral_code_id),
			),
		);

	return result[0].count;
};
