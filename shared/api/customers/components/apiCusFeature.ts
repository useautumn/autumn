import { EntInterval } from "@models/productModels/entModels/entEnums.js";
import { ProductItemFeatureType } from "@models/productV2Models/productItemModels/productItemModels.js";
import { z } from "zod/v4";

export const CusRolloverSchema = z.object({
	balance: z.number(),
	expires_at: z.number(),
});

// OLD CUS FEATURE RESPONSE
export const CusEntResponseSchema = z.object({
	feature_id: z.string(),
	interval: z.enum(EntInterval).nullish(),
	interval_count: z.number().nullish(),
	unlimited: z.boolean().nullish(),
	balance: z.number().nullish(), //
	usage: z.number().nullish(),
	included_usage: z.number().nullish(),
	next_reset_at: z.number().nullish(),
	overage_allowed: z.boolean().nullish(),
	usage_limit: z.number().nullish(),
	rollovers: z.array(CusRolloverSchema).nullish(),
});

// NEW CUS FEATURE RESPONSE
export const CoreCusFeatureSchema = z.object({
	interval: z.enum(EntInterval).or(z.literal("multiple")).nullish(),
	interval_count: z.number().nullish(),
	unlimited: z.boolean().nullish(),
	balance: z.number().nullish(),
	usage: z.number().nullish(),
	included_usage: z.number().nullish(),
	next_reset_at: z.number().nullish(),
	overage_allowed: z.boolean().nullish(),

	breakdown: z
		.array(
			z.object({
				interval: z.enum(EntInterval),
				interval_count: z.number().nullish(),
				balance: z.number().nullish(),
				usage: z.number().nullish(),
				included_usage: z.number().nullish(),
				next_reset_at: z.number().nullish(),
			}),
		)
		.nullish(),
	credit_schema: z
		.array(
			z.object({
				feature_id: z.string(),
				credit_amount: z.number(),
			}),
		)
		.nullish(),

	usage_limit: z.number().nullish(),
	rollovers: z.array(CusRolloverSchema).nullish(),
});

export const APICusFeatureSchema = z
	.object({
		id: z.string(),
		type: z.enum(ProductItemFeatureType),
		name: z.string().nullish(),
	})
	.extend(CoreCusFeatureSchema.shape);

export const CheckResultSchema = z
	.object({
		allowed: z.boolean(),
		customer_id: z.string(),
		feature_id: z.string(),
		entity_id: z.string().nullish(),
		required_balance: z.number(),
		code: z.string(),
	})
	.extend(CoreCusFeatureSchema.shape);

export type CusEntResponse = z.infer<typeof CusEntResponseSchema>;
export type CusEntResponseV2 = z.infer<typeof APICusFeatureSchema>;
export type CheckResponse = z.infer<typeof CheckResultSchema>;
export type CusRollover = z.infer<typeof CusRolloverSchema>;
