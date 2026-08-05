import type {
	ApiCouponV0,
	ApiFeatureGrantV0,
} from "../../../../../../shared/api/rewards/index.js";
import type { ApiReferralProgramV0 } from "../../../../../../shared/api/referralPrograms/index.js";
import type { ReferralProgram, Reward } from "../../../compose/index.js";

export const transformApiReward = (
	reward: ApiCouponV0 | ApiFeatureGrantV0,
): Reward =>
	"grants" in reward
		? {
				id: reward.id,
				name: reward.name ?? reward.id,
				type: "feature_grant",
				grants: reward.grants.map(({ feature_id, included, expiry }) => ({
					featureId: feature_id,
					...(included === null ? {} : { included }),
					...(expiry
						? {
								expiry: expiry as NonNullable<
									Extract<
										Reward,
										{ type: "feature_grant" }
									>["grants"][number]["expiry"]
								>,
							}
						: {}),
				})),
				promoCodes: reward.promo_codes.map(({ code, max_uses }) => ({
					code,
					...(max_uses === null ? {} : { maxUses: max_uses }),
				})),
			}
		: {
				id: reward.id,
				name: reward.name ?? reward.id,
				type: reward.type as "percentage_discount" | "fixed_discount",
				value: reward.value,
				duration: {
					type: reward.duration.type as "one_off" | "months" | "forever",
					...(reward.duration.length === null
						? {}
						: { length: reward.duration.length }),
				},
				...(reward.plan_ids ? { planIds: reward.plan_ids } : {}),
				promoCodes: reward.promo_codes.map(
					({ code, global_max_redemption, first_time_transaction }) => ({
						code,
						...(global_max_redemption === null
							? {}
							: { maxRedemptions: global_max_redemption }),
						...(first_time_transaction ? { firstTimeTransaction: true } : {}),
					}),
				),
			};

export const transformApiReferralProgram = (
	program: ApiReferralProgramV0,
): ReferralProgram => {
	const planIds = program.plan_ids?.filter(Boolean);
	return {
		id: program.id,
		rewardId: program.reward_id,
		redeemOn: program.redeem_on as ReferralProgram["redeemOn"],
		receivedBy: program.received_by as ReferralProgram["receivedBy"],
		...(program.max_redemptions == null
			? {}
			: { maxRedemptions: program.max_redemptions }),
		...(planIds?.length ? { planIds } : {}),
		...(program.exclude_trial ? { excludeTrial: true } : {}),
	};
};
