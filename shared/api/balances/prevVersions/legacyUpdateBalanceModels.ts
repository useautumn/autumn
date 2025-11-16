import { z } from "zod/v4";

export const UpdateBalancesParamsSchema = z.object({
	balances: z.array(
		z.object({
			feature_id: z.string().meta({
				description: "The ID of the feature to update balance for.",
			}),
			balance: z.number().meta({
				description: "The new balance value.",
			}),
		}),
	),
});
