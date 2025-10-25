import { ApiFeatureSchema } from "@api/features/apiFeature.js";
import { ResetInterval } from "@api/products/planEnums.js";
import { z } from "zod/v4";

export const ApiCusRolloverSchema = z.object({
	balance: z.number(),
	expires_at: z.number(),
});

export const ApiCusFeatureBreakdownSchema = z.object({
	reset: z
		.object({
			interval: z.enum(ResetInterval),
			interval_count: z.number().optional(),
			when_enabled: z.boolean().optional(),
		})
		.optional(),

	starting_balance: z.number(),
	balance: z.number(),
	usage: z.number(),
	resets_at: z.number().nullable(),

	max_purchase: z.number().optional(),
});

export const ApiCusFeatureSchema = z.object({
	feature_id: z.string(),
	feature: ApiFeatureSchema.optional(),

	unlimited: z.boolean(),

	granted_balance: z.number(), // 0
	purchased_balance: z.number(), // 3
	current_balance: z.number(), // 1
	usage: z.number(), // 2

	resets_at: z.number().nullable(),

	max_purchase: z.number().optional(),
	pay_per_use: z.boolean().optional(),

	reset: z
		.object({
			interval: z.enum(ResetInterval).nullable(),
			interval_count: z.number().optional(),
		})
		.optional(),

	breakdown: z.array(ApiCusFeatureBreakdownSchema).nullish(),
	rollovers: z.array(ApiCusRolloverSchema).nullish(),
});

export type ApiCusFeature = z.infer<typeof ApiCusFeatureSchema>;
export type ApiCusRollover = z.infer<typeof ApiCusRolloverSchema>;
export type ApiCusFeatureBreakdown = z.infer<
	typeof ApiCusFeatureBreakdownSchema
>;
