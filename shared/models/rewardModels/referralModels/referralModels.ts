import { z } from "zod";

const ReferralCodeSchema = z.object({
	// Code, org id, env should be unique
	code: z.string(),
	org_id: z.string(),
	env: z.string(),

	created_at: z.number(),
	internal_customer_id: z.string(),
	internal_reward_program_id: z.string(),

	// ID of the referral code
	id: z.string(),
});

const RewardRedemptionSchema = z.object({
	id: z.string(),
	created_at: z.number(),
	updated_at: z.number(),

	// Customer who signed up / paid
	internal_customer_id: z.string(), // customer who redeemed the code...
	internal_reward_program_id: z.string(), // reward scheme that was redeemed

	// Referral code used
	// code: z.string(),
	referral_code_id: z.string(),

	// Whether the reward was triggered
	triggered: z.boolean(),

	// Whether the (coupon) was applied
	applied: z.boolean(),
});

export type ReferralCode = z.infer<typeof ReferralCodeSchema>;
export type RewardRedemption = z.infer<typeof RewardRedemptionSchema>;
