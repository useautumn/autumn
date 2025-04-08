import { z } from "zod";

let ReferralCodeSchema = z.object({
  // Code, org id, env should be unique
  code: z.string(),
  org_id: z.string(),
  env: z.string(),

  created_at: z.number(),
  internal_customer_id: z.string(),
  internal_reward_trigger_id: z.string(),

  // ID of the referral code
  id: z.string(),
});

let RewardRedemptionSchema = z.object({
  id: z.string(),
  internal_reward_trigger_id: z.string().nullish(),
  created_at: z.number(),

  // Customer who signed up / paid
  internal_customer_id: z.string(), // customer who redeemed the code...

  // Referral code used
  code: z.string(),

  // Whether the reward was triggered
  triggered: z.boolean(),
});

export type ReferralCode = z.infer<typeof ReferralCodeSchema>;
export type RewardRedemption = z.infer<typeof RewardRedemptionSchema>;
