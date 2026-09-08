import type { ApiReferralProgramV0, RewardProgram } from "@autumn/shared";

/** Maps a reward_programs row to the V0 referral program shape.
 * `product_ids` defaults to `[""]` in the column, which is not a stated plan. */
export const getApiReferralProgram = ({
	rewardProgram,
	rewardId,
}: {
	rewardProgram: RewardProgram;
	rewardId: string;
}): ApiReferralProgramV0 => {
	const planIds = (rewardProgram.product_ids ?? []).filter(Boolean);
	return {
		id: rewardProgram.id,
		reward_id: rewardId,
		redeem_on: rewardProgram.when,
		received_by: rewardProgram.received_by,
		max_redemptions: rewardProgram.max_redemptions ?? null,
		plan_ids: planIds.length > 0 ? planIds : null,
		exclude_trial: rewardProgram.exclude_trial ?? false,
		created_at: rewardProgram.created_at,
	};
};
