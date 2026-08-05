import type { ApiReferralProgramV0, RewardProgram } from "@autumn/shared";

/** Maps a reward_programs row to the V0 referral program shape */
export const getApiReferralProgram = ({
	rewardProgram,
	rewardId,
}: {
	rewardProgram: RewardProgram;
	rewardId: string;
}): ApiReferralProgramV0 => ({
	id: rewardProgram.id,
	reward_id: rewardId,
	redeem_on: rewardProgram.when,
	received_by: rewardProgram.received_by,
	max_redemptions: rewardProgram.max_redemptions ?? null,
	plan_ids: rewardProgram.product_ids ?? null,
	exclude_trial: rewardProgram.exclude_trial ?? false,
	created_at: rewardProgram.created_at,
});
