import {
	customers,
	referralCodes,
	rewardPrograms,
	rewardRedemptions,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Find redemptions where the given customer is the referrer */
export const getRedemptionsByReferrer = async ({
	db,
	internalCustomerId,
	withRewardProgram = false,
	limit = 100,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	withRewardProgram?: boolean;
	limit?: number;
}) => {
	let query = db
		.select()
		.from(rewardRedemptions)
		.innerJoin(
			referralCodes,
			eq(rewardRedemptions.referral_code_id, referralCodes.id),
		)
		.innerJoin(
			customers,
			eq(rewardRedemptions.internal_customer_id, customers.internal_id),
		);

	if (withRewardProgram) {
		query = query.innerJoin(
			rewardPrograms,
			eq(
				rewardRedemptions.internal_reward_program_id,
				rewardPrograms.internal_id,
			),
		);
	}

	const data = await query
		.where(eq(referralCodes.internal_customer_id, internalCustomerId))
		.limit(limit);

	const processed = data.map((d) => ({
		...d.reward_redemptions,
		referral_code: d.referral_codes,
		customer: d.customers,
		reward_program: withRewardProgram ? (d as any).reward_programs : undefined,
	}));

	return processed;
};
