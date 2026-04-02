import {
	customers,
	referralCodes,
	rewardPrograms,
	rewardRedemptions,
	rewards,
} from "@autumn/shared";
import { and, eq, or } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Find triggered but unapplied redemptions for referrer or redeemer */
export const getUnappliedRedemptions = async ({
	db,
	internalCustomerId,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
}) => {
	const data = await db
		.select()
		.from(rewardRedemptions)
		.innerJoin(
			referralCodes,
			eq(rewardRedemptions.referral_code_id, referralCodes.id),
		)
		.innerJoin(
			customers,
			eq(rewardRedemptions.internal_customer_id, customers.internal_id),
		)
		.innerJoin(
			rewardPrograms,
			eq(
				rewardRedemptions.internal_reward_program_id,
				rewardPrograms.internal_id,
			),
		)
		.innerJoin(
			rewards,
			eq(rewardPrograms.internal_reward_id, rewards.internal_id),
		)
		.where(
			or(
				and(
					eq(referralCodes.internal_customer_id, internalCustomerId),
					eq(rewardRedemptions.triggered, true),
					eq(rewardRedemptions.applied, false),
				),
				and(
					eq(rewardRedemptions.internal_customer_id, internalCustomerId),
					eq(rewardRedemptions.triggered, true),
					eq(rewardRedemptions.redeemer_applied, false),
				),
			),
		);

	if (data.length === 0) return [];

	const processed = data.map((d) => ({
		...d.reward_redemptions,
		referral_code: d.referral_codes,
		reward_program: {
			...d.reward_programs,
			reward: d.rewards,
		},
	}));

	return processed;
};
