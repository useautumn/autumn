import z from "zod";

export enum RewardTriggerEvent {
  SignUp = "sign_up",
  Checkout = "checkout",
}

export const RewardTrigger = z.object({
  internal_id: z.string(),
  id: z.string(),

  trigger: z.object({
    type: z.nativeEnum(RewardTriggerEvent),
    product_id: z.string().optional(),
  }),

  internal_reward_id: z.string(),

  unlimited_redemptions: z.boolean().optional(),
  max_redemptions: z.number().optional(),

  org_id: z.string(),
  env: z.string(),
  created_at: z.number(),
});

export const CreateRewardTrigger = z.object({
  id: z.string(),
  trigger: z.object({
    type: z.nativeEnum(RewardTriggerEvent),
    product_id: z.string().optional(),
  }),
  internal_reward_id: z.string(),
  max_redemptions: z.number().optional(),
});

export type RewardTrigger = z.infer<typeof RewardTrigger>;
export type CreateRewardTrigger = z.infer<typeof CreateRewardTrigger>;
