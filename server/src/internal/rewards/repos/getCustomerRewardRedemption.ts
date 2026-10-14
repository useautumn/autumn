import { type RewardRedemption, rewardRedemptions } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const getCustomerRewardRedemption = async ({
	db,
	internalCustomerId,
	rewardInternalId,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	rewardInternalId: string;
}) => {
	const result = await db.query.rewardRedemptions.findFirst({
		where: and(
			eq(rewardRedemptions.internal_customer_id, internalCustomerId),
			eq(rewardRedemptions.reward_internal_id, rewardInternalId),
		),
	});

	return (result as RewardRedemption) ?? null;
};
