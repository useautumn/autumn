import { notNullish, ResetInterval } from "@autumn/shared";
import { z } from "zod/v4";

export const UpdateBalanceParamsSchema = z
	.object({
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
		granted_balance: z.number().optional().meta({
			description: "The new granted balance value to set.",
		}),
		usage: z.number().optional().meta({
			description: "The new usage value to set.",
		}),
		interval: z.enum(ResetInterval).optional().meta({
			description: "The interval to update balance for.",
		}),
	})
	.refine(
		(data) => {
			if (notNullish(data.current_balance) && notNullish(data.usage)) {
				return false;
			}
			if (!notNullish(data.current_balance) && !notNullish(data.usage)) {
				return false;
			}
			return true;
		},
		{
			message:
				"Either 'current_balance' or 'usage' must be provided, but not both.",
		},
	);

export type UpdateBalanceParams = z.infer<typeof UpdateBalanceParamsSchema>;

// Legacy export for backwards compatibility
export const BalancesUpdateParamsSchema = UpdateBalanceParamsSchema;
export type BalancesUpdateParams = UpdateBalanceParams;
