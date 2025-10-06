import { EntInterval } from "@models/productModels/entModels/entEnums.js";
import { ProductItemFeatureType } from "@models/productV2Models/productItemModels/productItemModels.js";
import { z } from "zod/v4";

// const res: any = {
//   feature_id: ent.feature.id,
//   unlimited: isBoolean ? undefined : unlimited,
//   interval: isBoolean || unlimited ? null : ent.interval || undefined,
//   balance: isBoolean ? undefined : unlimited ? null : 0,
//   total: isBoolean || unlimited ? undefined : 0,
//   adjustment: isBoolean || unlimited ? undefined : 0,
//   used: isBoolean ? undefined : unlimited ? null : 0,
//   unused: 0,
// };

/**
 * ApiCusFeatureV0Schema - The very first version of the customer feature API model
 */
export const ApiCusFeatureV0Schema = z.object({
	feature_id: z.string(),
	interval: z.enum(EntInterval).nullish(),
	interval_count: z.number().nullish(),
	unlimited: z.boolean().nullish(),
	balance: z.number().nullish(),
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
	// rollovers: z.array(CusRolloverSchema).nullish(),
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

export type CusEntResponse = z.infer<typeof CusEntResponseSchema>;
export type CusEntResponseV2 = z.infer<typeof APICusFeatureSchema>;
export type CusRollover = z.infer<typeof CusRolloverSchema>;
