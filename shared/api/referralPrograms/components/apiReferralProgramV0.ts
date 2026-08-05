import {
	RewardReceivedBy,
	RewardTriggerEvent,
} from "@models/rewardModels/rewardProgramModels/rewardProgramEnums.js";
import { z } from "zod/v4";

export const REFERRAL_PROGRAM_V0_EXAMPLE = {
	id: "refer_a_friend",
	reward_id: "beta_credits_grant",
	redeem_on: RewardTriggerEvent.CustomerCreation,
	received_by: RewardReceivedBy.Referrer,
	max_redemptions: 10,
	plan_ids: null,
	exclude_trial: false,
	created_at: 1_718_000_000_000,
};

export const ApiReferralProgramV0Schema = z
	.object({
		id: z.string().meta({
			description: "The unique identifier for the referral program.",
		}),
		reward_id: z.string().meta({
			description: "The ID of the reward granted when a code is redeemed.",
		}),
		redeem_on: z.enum(RewardTriggerEvent).meta({
			description:
				"When the reward is granted: on redemption, or when the redeemer checks out.",
		}),
		received_by: z.enum(RewardReceivedBy).meta({
			description:
				"Who receives the reward: the referrer only, or both parties.",
		}),
		max_redemptions: z.number().nullish().meta({
			description:
				"The maximum number of times a referral code can be redeemed.",
		}),
		plan_ids: z.array(z.string()).nullish().meta({
			description:
				"The plans whose checkout triggers the reward. Only used when redeem_on is checkout.",
		}),
		exclude_trial: z.boolean().nullish().meta({
			description:
				"Whether checkouts that start a trial should skip granting the reward.",
		}),
		created_at: z.number().meta({
			description:
				"The Unix timestamp (in milliseconds) when the referral program was created.",
		}),
	})
	.meta({
		examples: [REFERRAL_PROGRAM_V0_EXAMPLE],
	});

export type ApiReferralProgramV0 = z.infer<typeof ApiReferralProgramV0Schema>;
