import { ResetInterval } from "@models/productModels/intervals/resetInterval.js";
import { z } from "zod/v4";
import { ApiFeatureV1Schema } from "../../features/apiFeatureV1.js";

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
	id: z.string().default(""),
	plan_id: z.string().optional(),

	granted_balance: z.number(),
	purchased_balance: z.number(),
	current_balance: z.number(),
	usage: z.number(),

	overage_allowed: z.boolean(),
	max_purchase: z.number().nullable(),
	reset: ApiBalanceResetSchema.nullable(),
});

export const ApiBalanceSchema = z.object({
	feature_id: z.string(),
	feature: ApiFeatureV1Schema.optional(),
	unlimited: z.boolean(),

	granted_balance: z.number(),
	purchased_balance: z.number(),
	current_balance: z.number(),
	usage: z.number(),

	overage_allowed: z.boolean(),
	max_purchase: z.number().nullable(),
	reset: ApiBalanceResetSchema.nullable(),

	plan_id: z.string().nullable(),
	breakdown: z.array(ApiBalanceBreakdownSchema).optional(),
	rollovers: z.array(ApiBalanceRolloverSchema).optional(),
});

export type ApiBalanceReset = z.infer<typeof ApiBalanceResetSchema>;
export type ApiBalanceRollover = z.infer<typeof ApiBalanceRolloverSchema>;
export type ApiBalanceBreakdown = z.infer<typeof ApiBalanceBreakdownSchema>;
export type ApiBalance = z.infer<typeof ApiBalanceSchema>;
