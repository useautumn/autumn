import { z } from "zod/v4";

export const CreateReferralCodeResponseSchema = z
	.object({
		code: z.string().meta({
			description: "The referral code that can be shared with customers",
			example: "REF123ABC",
		}),
		customer_id: z.string().meta({
			description: "Your unique identifier for the customer",
			example: "cus_123",
		}),
		created_at: z.number().meta({
			description: "The timestamp of when the referral code was created",
			example: 1717000000,
		}),
	})
	.meta({
		id: "ReferralCode",
		description: "Referral code object returned by the API",
	});

export const RedeemReferralCodeResponseSchema = z
	.object({
		id: z.string().meta({
			description: "The ID of the redemption event",
			example: "red_123",
		}),
		customer_id: z.string().meta({
			description: "Your unique identifier for the customer",
			example: "cus_456",
		}),
		reward_id: z.string().meta({
			description: "The ID of the reward that will be granted",
			example: "reward_789",
		}),
	})
	.meta({
		id: "RedeemReferralCodeResponse",
		description: "Redemption response object returned by the API",
	});

export type CreateReferralCodeResponse = z.infer<
	typeof CreateReferralCodeResponseSchema
>;
export type RedeemReferralCodeResponse = z.infer<
	typeof RedeemReferralCodeResponseSchema
>;
