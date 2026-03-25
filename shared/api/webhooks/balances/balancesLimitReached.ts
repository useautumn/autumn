import { z } from "zod/v4";

export const LimitType = z.enum(["included", "max_purchase", "spend_limit"]);

export const BALANCES_LIMIT_REACHED_EXAMPLE = {
	customer_id: "org_123",
	entity_id: "workspace_abc",
	feature_id: "api_calls",
	limit_type: "included",
};

export const BalancesLimitReachedSchema = z
	.object({
		customer_id: z.string().meta({
			description: "The ID of the customer who hit the limit.",
		}),
		entity_id: z.string().optional().meta({
			description:
				"The entity ID, if the limit was reached on a specific entity.",
		}),
		feature_id: z.string().meta({
			description: "The feature ID whose limit was reached.",
		}),
		limit_type: LimitType.meta({
			description:
				"Which limit was hit: included allowance, max purchase cap, or spend limit.",
		}),
	})
	.meta({
		examples: [BALANCES_LIMIT_REACHED_EXAMPLE],
	});

export type BalancesLimitReached = z.infer<typeof BalancesLimitReachedSchema>;
