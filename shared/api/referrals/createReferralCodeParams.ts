import { z } from "zod/v4";

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

export type CreateReferralCodeParams = z.infer<
	typeof CreateReferralCodeParamsSchema
>;
