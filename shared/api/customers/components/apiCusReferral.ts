import { z } from "zod/v4";

export const ApiCusReferralSchema = z.object({
	program_id: z.string(),
	customer: z.object({
		id: z.string(),
		name: z.string().nullish(),
		email: z.string().nullish(),
	}),
	reward_applied: z.boolean(),
	created_at: z.number(),
});

export type ApiCusReferralResponse = z.infer<typeof ApiCusReferralSchema>;
