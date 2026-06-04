import { z } from "zod/v4";
import { ResetInterval } from "../../..";
export const RecalculateBalanceParamsV0Schema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer.",
	}),
	feature_id: z.string().meta({
		description: "The ID of the feature whose balances should be recalculated.",
	}),
	entity_id: z.string().optional().meta({
		description: "The ID of the entity.",
	}),
	interval: z.enum(ResetInterval).optional().meta({
		description:
			"Target balances with a specific reset interval. Use when the customer has multiple balances for the same feature with different reset intervals.",
	}),
});

export type RecalculateBalanceParamsV0 = z.infer<
	typeof RecalculateBalanceParamsV0Schema
>;
