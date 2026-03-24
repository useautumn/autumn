import { rewardRedemptions } from "@autumn/shared";
import { and, count, eq, isNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Count redemptions for a specific promo code on a reward */
export const getPromoCodeRedemptionCount = async ({
	db,
	rewardInternalId,
	promoCode,
}: {
	db: DrizzleCli;
	rewardInternalId: string;
	promoCode: string;
}) => {
	const result = await db
		.select({ count: count() })
		.from(rewardRedemptions)
		.where(
			and(
				eq(rewardRedemptions.reward_internal_id, rewardInternalId),
				eq(rewardRedemptions.promo_code, promoCode),
				isNull(rewardRedemptions.referral_code_id),
			),
		);

	return result[0].count;
};
