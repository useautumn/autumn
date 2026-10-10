import {
	customers,
	referralCodes,
	rewardPrograms,
	rewardRedemptions,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type RelationshipDirection = "referrer" | "redeemer";

export const queryRelationshipRedemptions = async ({
	db,
	internalCustomerId,
	direction,
	withRewardProgram = false,
	limit = 100,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	direction: RelationshipDirection;
	withRewardProgram?: boolean;
	limit?: number;
}) => {
	const isReferrer = direction === "referrer";

	let query = db
		.select()
		.from(rewardRedemptions)
		.innerJoin(
			referralCodes,
			eq(rewardRedemptions.referral_code_id, referralCodes.id),
		)
		.innerJoin(
			customers,
			eq(
				isReferrer
					? rewardRedemptions.internal_customer_id
					: referralCodes.internal_customer_id,
				customers.internal_id,
			),
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

	const filterColumn = isReferrer
		? referralCodes.internal_customer_id
		: rewardRedemptions.internal_customer_id;

	const data = await query
		.where(eq(filterColumn, internalCustomerId))
		.limit(limit);

	return data.map((d) => ({
		...d.reward_redemptions,
		referral_code: d.referral_codes,
		related_customer: d.customers,
		reward_program: withRewardProgram ? (d as any).reward_programs : undefined,
	}));
};
