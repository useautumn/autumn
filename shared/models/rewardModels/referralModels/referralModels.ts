import { z } from "zod/v4";

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

	internal_customer_id: z.string(),

	// Referral redemptions: these are set, reward_internal_id may be null
	internal_reward_program_id: z.string().nullable(),
	referral_code_id: z.string().nullable(),

	// Promo code redemptions: these are set, referral fields are null
	reward_internal_id: z.string().nullable(),
	promo_code: z.string().nullable(),

	triggered: z.boolean(),
	applied: z.boolean(),
	redeemer_applied: z.boolean(),
});

export type ReferralCode = z.infer<typeof ReferralCodeSchema>;
export type RewardRedemption = z.infer<typeof RewardRedemptionSchema>;
