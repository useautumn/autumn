import { z } from "zod/v4";

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

export type RedeemReferralCodeParams = z.infer<
	typeof RedeemReferralCodeParamsSchema
>;
