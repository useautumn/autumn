import type { ReferralProgram, Reward } from "../../../compose/index.js";
import type { CatalogUpdateParamsInput } from "../../api/endpoints/catalog.js";

export const transformRewardToApi = (
	reward: Reward,
): NonNullable<CatalogUpdateParamsInput["rewards"]>[number] => {
	if (
		reward.type !== "feature_grant" &&
		reward.duration.type === "months" &&
		(!Number.isInteger(reward.duration.length) || reward.duration.length <= 0)
	) {
		throw new Error("Month reward duration length must be a positive integer");
	}

	return (
		reward.type === "feature_grant"
			? {
					feature_grant: {
						id: reward.id,
						name: reward.name,
						grants: reward.grants.map(({ featureId, included, expiry }) => ({
							feature_id: featureId,
							included: included ?? null,
							expiry: expiry ?? null,
						})),
						promo_codes: reward.promoCodes.map(({ code, maxUses }) => ({
							code,
							max_uses: maxUses ?? null,
						})),
					},
				}
			: {
					coupon: {
						id: reward.id,
						name: reward.name,
						type: reward.type,
						value: reward.value,
						duration: {
							type: reward.duration.type,
							length:
								reward.duration.type === "months"
									? reward.duration.length
									: null,
						},
						plan_ids: reward.planIds ?? null,
						promo_codes: (reward.promoCodes ?? []).map(
							({ code, maxRedemptions, firstTimeTransaction }) => ({
								code,
								global_max_redemption: maxRedemptions ?? null,
								first_time_transaction: firstTimeTransaction ?? false,
							}),
						),
					},
				}
	) as NonNullable<CatalogUpdateParamsInput["rewards"]>[number];
};

export const transformReferralProgramToApi = (
	program: ReferralProgram,
): NonNullable<CatalogUpdateParamsInput["referral_programs"]>[number] =>
	({
		id: program.id,
		reward_id: program.rewardId,
		redeem_on: program.redeemOn,
		received_by: program.receivedBy,
		max_redemptions: program.maxRedemptions ?? null,
		plan_ids: program.planIds ?? null,
		exclude_trial: program.excludeTrial ?? false,
	}) as NonNullable<CatalogUpdateParamsInput["referral_programs"]>[number];
