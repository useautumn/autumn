import { z } from "zod/v4";

export const BalancesUpdateParamsSchema = z.object({
	customer_id: z.string(),
	entity_id: z.string().optional(),
	feature_id: z.string(),
	current_balance: z.number(),
	usage: z.number().optional(),
});

export type BalancesUpdateParams = z.infer<typeof BalancesUpdateParamsSchema>;
