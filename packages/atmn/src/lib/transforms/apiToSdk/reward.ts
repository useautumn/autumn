import type { ApiReferralProgramV0 } from "../../../../../../shared/api/referralPrograms/index.js";
import type {
	ApiCouponV0,
	ApiFeatureGrantV0,
} from "../../../../../../shared/api/rewards/index.js";
import type { ReferralProgram, Reward } from "../../../compose/index.js";
import type {
	FeatureGrantReward,
	RewardDuration,
} from "../../../compose/models/rewardModels.js";

const transformDuration = (
	duration: ApiCouponV0["duration"],
): RewardDuration => {
	if (duration.type !== "months") return { type: duration.type };
	if (duration.length === null)
		throw new Error("Monthly reward duration is missing its length");
	if (!Number.isInteger(duration.length) || duration.length <= 0)
		throw new Error("Monthly reward duration must be a positive integer");
	return { type: "months", length: duration.length };
};

export const transformApiReward = (
	reward: ApiCouponV0 | ApiFeatureGrantV0,
): Reward => {
	if ("type" in reward && reward.type === "invoice_credits") {
		throw new Error(
			`Invoice credit reward "${reward.id}" is not supported in autumn.config.ts`,
		);
	}
	if (
		"grants" in reward &&
		(!reward.grants.length || !reward.promo_codes.length)
	) {
		throw new Error(
			`Feature grant reward "${reward.id}" requires at least one grant and promo code`,
		);
	}

	return "grants" in reward
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
									FeatureGrantReward["grants"][number]["expiry"]
								>,
							}
						: {}),
				})) as FeatureGrantReward["grants"],
				promoCodes: reward.promo_codes.map(({ code, max_uses }) => ({
					code,
					...(max_uses === null ? {} : { maxUses: max_uses }),
				})) as FeatureGrantReward["promoCodes"],
			}
		: {
				id: reward.id,
				name: reward.name ?? reward.id,
				type: reward.type as "percentage_discount" | "fixed_discount",
				value: reward.value,
				duration: transformDuration(reward.duration),
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
