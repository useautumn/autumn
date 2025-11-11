import { ApiFeatureSchema } from "@api/features/apiFeature.js";
import { ResetInterval } from "@api/products/planEnums.js";
import { z } from "zod/v4";

export const ApiBalanceResetSchema = z.object({
	interval: z.enum(ResetInterval).or(z.literal("multiple")),
	interval_count: z.number().optional(),
	resets_at: z.number().nullable(),
});

export const ApiBalanceRolloverSchema = z.object({
	balance: z.number(),
	expires_at: z.number(),
});

export const ApiBalanceBreakdownSchema = z.object({
	granted_balance: z.number(),
	purchased_balance: z.number(),
	current_balance: z.number(),
	usage: z.number(),

	max_purchase: z.number().optional(),
	overage_allowed: z.boolean().optional(),

	reset: ApiBalanceResetSchema.optional(),
});

export const ApiBalanceSchema = z.object({
	feature_id: z.string(),
	feature: ApiFeatureSchema.optional(),
	unlimited: z.boolean(),

	granted_balance: z.number(),
	purchased_balance: z.number(),
	current_balance: z.number(),
	usage: z.number(),

	max_purchase: z.number(),
	overage_allowed: z.boolean(),

	reset: ApiBalanceResetSchema.optional(),
	breakdown: z.array(ApiBalanceBreakdownSchema).nullish(),
	rollovers: z.array(ApiBalanceRolloverSchema).nullish(),
});

export type ApiBalanceReset = z.infer<typeof ApiBalanceResetSchema>;
export type ApiBalanceRollover = z.infer<typeof ApiBalanceRolloverSchema>;
export type ApiBalanceBreakdown = z.infer<typeof ApiBalanceBreakdownSchema>;
export type ApiBalance = z.infer<typeof ApiBalanceSchema>;
