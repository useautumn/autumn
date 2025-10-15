import { ApiFeatureType } from "@api/features/apiFeature.js";
import { EntInterval } from "@models/productModels/entModels/entEnums.js";
import { z } from "zod/v4";

export const ApiCusRolloverSchema = z.object({
	balance: z.number(),
	expires_at: z.number(),
});

// Version 3 of cus feature response
export const ApiCusFeatureBreakdownSchema = z.object({
	interval: z.enum(EntInterval),
	interval_count: z.number().nullish(),
	balance: z.number().nullish(),
	usage: z.number().nullish(),
	included_usage: z.number().nullish(),
	next_reset_at: z.number().nullish(),
	usage_limit: z.number().nullish(),
	rollovers: z.array(ApiCusRolloverSchema).nullish(),
});

export const CoreCusFeatureSchema = z.object({
	interval: z.enum(EntInterval).or(z.literal("multiple")).nullish(),
	interval_count: z.number().nullish(),
	unlimited: z.boolean().nullish(),
	balance: z.number().nullish(),
	usage: z.number().nullish(),
	included_usage: z.number().nullish(),
	next_reset_at: z.number().nullish(),
	overage_allowed: z.boolean().nullish(),

	breakdown: z.array(ApiCusFeatureBreakdownSchema).nullish(),
	credit_schema: z
		.array(
			z.object({
				feature_id: z.string(),
				credit_amount: z.number(),
			}),
		)
		.nullish(),

	usage_limit: z.number().nullish(),
	rollovers: z.array(ApiCusRolloverSchema).nullish(),
});

export const ApiCusFeatureSchema = z
	.object({
		id: z.string(),
		type: z.enum(ApiFeatureType),
		name: z.string().nullish(),
	})
	.extend(CoreCusFeatureSchema.shape);

export type ApiCusFeature = z.infer<typeof ApiCusFeatureSchema>;
export type ApiCusRollover = z.infer<typeof ApiCusRolloverSchema>;
export type ApiCusFeatureBreakdown = z.infer<
	typeof ApiCusFeatureBreakdownSchema
>;
