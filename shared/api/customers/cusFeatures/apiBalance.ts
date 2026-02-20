import { ResetInterval } from "@models/productModels/intervals/resetInterval";
import { z } from "zod/v4";
import { ApiFeatureV1Schema } from "../../features/apiFeatureV1";

export const ApiBalanceResetSchema = z.object({
	interval: z.enum(ResetInterval).or(z.literal("multiple")).meta({
		description:
			"The reset interval (hour, day, week, month, etc.) or 'multiple' if combined from different intervals.",
	}),
	interval_count: z.number().optional().meta({
		description: "Number of intervals between resets (eg. 2 for bi-monthly).",
	}),
	resets_at: z.number().nullable().meta({
		description: "Timestamp when the balance will next reset.",
	}),
});

export const ApiBalanceRolloverSchema = z.object({
	balance: z.number().meta({
		description: "Amount of balance rolled over from a previous period.",
	}),
	expires_at: z.number().meta({
		description: "Timestamp when the rollover balance expires.",
	}),
});

export const ApiBalanceBreakdownSchema = z.object({
	id: z.string().default("").meta({
		description: "The unique identifier for this balance breakdown.",
	}),
	plan_id: z.string().nullable().meta({
		description:
			"The plan ID this balance originates from, or null for standalone balances.",
	}),

	granted_balance: z.number().meta({
		description: "Amount granted from the plan's included usage.",
	}),
	purchased_balance: z.number().meta({
		description: "Amount granted from prepaid purchases or top-ups.",
	}),
	current_balance: z.number().meta({
		description: "Current remaining balance available for use.",
	}),
	usage: z.number().meta({
		description: "Amount consumed in the current period.",
	}),

	overage_allowed: z.boolean().meta({
		description:
			"Whether usage beyond the granted balance is allowed (with overage charges).",
	}),
	max_purchase: z.number().nullable().meta({
		description:
			"Maximum quantity that can be purchased as a top-up, or null for unlimited.",
	}),
	reset: ApiBalanceResetSchema.nullable().meta({
		description: "Reset configuration for this balance, or null if no reset.",
	}),

	prepaid_quantity: z.number().default(0).meta({
		description: "Quantity of prepaid units purchased.",
	}),
	expires_at: z.number().nullable().meta({
		description:
			"Timestamp when this balance expires, or null for no expiration.",
	}),
});

export const ApiBalanceSchema = z.object({
	feature_id: z.string().meta({
		description: "The feature ID this balance is for.",
	}),
	feature: ApiFeatureV1Schema.optional().meta({
		description: "The full feature object if expanded.",
	}),
	unlimited: z.boolean().meta({
		description: "Whether this feature has unlimited usage.",
	}),

	granted_balance: z.number().meta({
		description: "Total balance granted from the plan's included usage.",
	}),
	purchased_balance: z.number().meta({
		description: "Total balance from prepaid purchases or top-ups.",
	}),
	current_balance: z.number().meta({
		description: "Current remaining balance available for use.",
	}),
	usage: z.number().meta({
		description: "Total usage consumed in the current period.",
	}),

	overage_allowed: z.boolean().meta({
		description:
			"Whether usage beyond the granted balance is allowed (with overage charges).",
	}),
	max_purchase: z.number().nullable().meta({
		description:
			"Maximum quantity that can be purchased as a top-up, or null for unlimited.",
	}),
	reset: ApiBalanceResetSchema.nullable().meta({
		description: "Reset configuration for this balance, or null for no reset.",
	}),

	plan_id: z.string().nullable().meta({
		description:
			"The primary plan ID this balance is associated with, or null for standalone balances.",
	}),
	breakdown: z.array(ApiBalanceBreakdownSchema).optional().meta({
		description:
			"Detailed breakdown of balance sources when stacking multiple plans or grants.",
	}),
	rollovers: z.array(ApiBalanceRolloverSchema).optional().meta({
		description: "Rollover balances carried over from previous periods.",
	}),
});

export type ApiBalanceReset = z.infer<typeof ApiBalanceResetSchema>;
export type ApiBalanceRollover = z.infer<typeof ApiBalanceRolloverSchema>;
export type ApiBalanceBreakdown = z.infer<typeof ApiBalanceBreakdownSchema>;
export type ApiBalance = z.infer<typeof ApiBalanceSchema>;
