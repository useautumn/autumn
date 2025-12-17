import { ResetInterval } from "@autumn/shared";
import { z } from "zod/v4";

export const ExtBalancesUpdateParamsSchema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer.",
	}),
	entity_id: z.string().optional().meta({
		description:
			"The ID of the entity to update balance for (if using entity balances).",
	}),
	feature_id: z.string().meta({
		description: "The ID of the feature to update balance for.",
	}),
	current_balance: z.number().optional().meta({
		description: "The new balance value to set.",
	}),
	interval: z.enum(ResetInterval).optional().meta({
		description: "The interval to update balance for.",
	}),
});

export const UpdateBalanceParamsSchema = ExtBalancesUpdateParamsSchema.extend({
	granted_balance: z.number().optional(),
	usage: z.number().optional(),
	customer_entitlement_id: z.string().optional(),
	next_reset_at: z.number().optional(),
});

export type UpdateBalanceParams = z.infer<typeof UpdateBalanceParamsSchema>;

// Legacy export for backwards compatibility
export const BalancesUpdateParamsSchema = UpdateBalanceParamsSchema;
export type BalancesUpdateParams = UpdateBalanceParams;
