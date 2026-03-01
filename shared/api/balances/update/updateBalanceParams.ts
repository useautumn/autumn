import { ResetInterval } from "@autumn/shared";
import { z } from "zod/v4";
import { BalanceParamsBaseSchema } from "../common/balanceParamsBase";

export const ExtUpdateBalanceParamsV0Schema = BalanceParamsBaseSchema.extend({
	remaining: z.number().optional().meta({
		description:
			"Set the remaining balance to this exact value. Cannot be combined with add_to_balance.",
	}),
	add_to_balance: z.number().optional().meta({
		description:
			"Add this amount to the current balance. Use negative values to subtract. Cannot be combined with current_balance.",
	}),

	usage: z.number().optional().meta({
		description:
			"The usage amount to update. Cannot be combined with remaining or add_to_balance.",
	}),

	interval: z.enum(ResetInterval).optional().meta({
		description:
			"Target a specific balance by its reset interval. Use when the customer has multiple balances for the same feature with different reset intervals.",
	}),
});

export const UpdateBalanceParamsV0Schema =
	ExtUpdateBalanceParamsV0Schema.extend({
		current_balance: z.number().optional().meta({
			description:
				"Alias for remaining. Set the current balance to this exact value. Cannot be combined with add_to_balance.",
		}),

		granted_balance: z.number().optional().meta({
			description:
				"Set the granted (included) balance for this entitlement. Requires current_balance to also be provided.",
		}),

		customer_entitlement_id: z.string().optional().meta({ internal: true }),
		next_reset_at: z.number().optional().meta({
			description:
				"Override the next reset timestamp for this balance (Unix timestamp in milliseconds).",
		}),
	})
		.refine(
			(data) => {
				const targetBalance = data.remaining ?? data.current_balance;

				return !(
					data.add_to_balance !== undefined && targetBalance !== undefined
				);
			},
			{ message: "Cannot specify both add_to_balance and remaining" },
		)
		.refine(
			(data) => {
				const remaining = data.remaining ?? data.current_balance;

				return !(data.usage !== undefined && remaining !== undefined);
			},
			{ message: "Cannot specify both usage and remaining" },
		);

export type UpdateBalanceParamsV0 = z.infer<typeof UpdateBalanceParamsV0Schema>;
