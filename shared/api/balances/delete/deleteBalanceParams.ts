import { z } from "zod/v4";
import { ResetInterval } from "../../..";
export const DeleteBalanceParamsV0Schema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer.",
	}),
	entity_id: z.string().optional().meta({
		description: "The ID of the entity.",
	}),
	feature_id: z.string().optional().meta({
		description: "The ID of the feature.",
	}),
	balance_id: z.string().optional().meta({
		description: "The ID of the balance to delete.",
	}),
	recalculate_balances: z.boolean().optional().meta({
		description:
			"If true, deduct the deleted balance's remaining amount from the customer's other balances for the same feature after deletion.",
	}),

	interval: z.enum(ResetInterval).optional().meta({
		description:
			"Target a specific balance by its reset interval. Use when the customer has multiple balances for the same feature with different reset intervals.",
	}),
});

export type DeleteBalanceParamsV0 = z.infer<typeof DeleteBalanceParamsV0Schema>;
