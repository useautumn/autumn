import { ResetInterval } from "@autumn/shared";
import { z } from "zod/v4";

export const CreateBalanceSchema = z.object({
	feature_id: z.string(),
	granted_balance: z.number().optional(),
	unlimited: z.boolean().optional(),
	reset: z
		.object({
			interval: z.enum(ResetInterval),
			interval_count: z.number().optional(),
		})
		.optional(),
	customer_id: z.string(),
});

export type CreateBalanceParams = z.infer<typeof CreateBalanceSchema>;
