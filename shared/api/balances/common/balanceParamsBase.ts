import { z } from "zod/v4";

export const BalanceParamsBaseSchema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer.",
	}),
	feature_id: z.string().meta({
		description: "The ID of the feature.",
	}),
	entity_id: z.string().optional().meta({
		description:
			"The ID of the entity for entity-scoped balances (e.g., per-seat limits).",
	}),
});
