import { z } from "zod";
import { Reward } from "../rewardModels/rewardModels.js";
import { RewardReceivedBy } from "./rewardProgramEnums.js";
import { RewardTriggerEvent } from "./rewardProgramEnums.js";

export const RewardProgram = z.object({
	internal_id: z.string(),
	id: z.string(),

	when: z.nativeEnum(RewardTriggerEvent),
	product_ids: z.array(z.string()).optional(),
	exclude_trial: z.boolean().optional(),

	internal_reward_id: z.string(),

	unlimited_redemptions: z.boolean().optional(),
	max_redemptions: z.number().optional(),

	org_id: z.string(),
	env: z.string(),
	created_at: z.number(),

	received_by: z.nativeEnum(RewardReceivedBy),
});

export const CreateRewardProgram = z.object({
	id: z.string(),
	when: z.nativeEnum(RewardTriggerEvent),
	product_ids: z.array(z.string()).optional(),
	exclude_trial: z.boolean().optional(),
	internal_reward_id: z.string(),
	max_redemptions: z.number().optional(),
	received_by: z.nativeEnum(RewardReceivedBy),
});

export type RewardProgram = z.infer<typeof RewardProgram>;
export type CreateRewardProgram = z.infer<typeof CreateRewardProgram>;

export type FullRewardProgram = RewardProgram & {
	reward: Reward;
};
