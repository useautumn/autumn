import z from "zod";
import { Reward } from "../rewardModels/rewardModels.js";

export enum RewardTriggerEvent {
  // SignUp = "sign_up",
  Immediately = "immediately",
  Checkout = "checkout",
}

export const RewardTrigger = z.object({
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
});

export const CreateRewardTrigger = z.object({
  id: z.string(),
  when: z.nativeEnum(RewardTriggerEvent),
  product_ids: z.array(z.string()).optional(),
  exclude_trial: z.boolean().optional(),
  internal_reward_id: z.string(),
  max_redemptions: z.number().optional(),
});

export type RewardTrigger = z.infer<typeof RewardTrigger>;
export type CreateRewardTrigger = z.infer<typeof CreateRewardTrigger>;

export type FullRewardTrigger = RewardTrigger & {
  reward: Reward;
};
