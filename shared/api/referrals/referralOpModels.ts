import { z } from "zod/v4";

// Create Referral Code Request
export const CreateReferralCodeParamsSchema = z.object({
	customer_id: z.string().meta({
		description: "The unique identifier of the customer",
		example: "cus_123",
	}),
	program_id: z.string().meta({
		description: "ID of your referral program",
		example: "prog_123",
	}),
});

// Redeem Referral Code Request
export const RedeemReferralCodeParamsSchema = z.object({
	code: z.string().meta({
		description: "The referral code to redeem",
		example: "REF123ABC",
	}),
	customer_id: z.string().meta({
		description: "The unique identifier of the customer redeeming the code",
		example: "cus_456",
	}),
});

export type CreateReferralCodeParams = z.infer<
	typeof CreateReferralCodeParamsSchema
>;
export type RedeemReferralCodeParams = z.infer<
	typeof RedeemReferralCodeParamsSchema
>;
