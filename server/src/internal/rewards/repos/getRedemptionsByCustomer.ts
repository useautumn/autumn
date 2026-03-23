import {
	type FullRewardProgram,
	type ReferralCode,
	type RewardRedemption,
	rewardRedemptions,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

type RedemptionWithRelations = RewardRedemption & {
	reward_program: FullRewardProgram;
	referral_code: ReferralCode;
};

/** Fetch redemptions for a customer with reward program + referral code relations */
export const getRedemptionsByCustomer = async ({
	db,
	internalCustomerId,
	triggered,
	internalRewardProgramId,
	limit,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	triggered?: boolean;
	internalRewardProgramId?: string;
	limit?: number;
}) => {
	const data = await db.query.rewardRedemptions.findMany({
		where: and(
			eq(rewardRedemptions.internal_customer_id, internalCustomerId),
			internalRewardProgramId
				? eq(
						rewardRedemptions.internal_reward_program_id,
						internalRewardProgramId,
					)
				: undefined,
			triggered !== undefined
				? eq(rewardRedemptions.triggered, triggered)
				: undefined,
		),
		with: {
			reward_program: {
				with: {
					reward: true,
				},
			},
			referral_code: true,
		},
		limit: limit ?? 100,
	});

	return data as RedemptionWithRelations[];
};
