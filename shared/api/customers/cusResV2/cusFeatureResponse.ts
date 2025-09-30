// import { z } from "zod/v4";
// import { EntInterval } from "../../productModels/entModels/entEnums.js";
// import { ProductItemFeatureType } from "../../productV2Models/productItemModels/productItemModels.js";

// export const CusRolloverSchema = z.object({
// 	balance: z.number(),
// 	expires_at: z.number(),
// });

// export const CusEntResponseSchema = z.object({
// 	feature_id: z.string(),
// 	interval: z.nativeEnum(EntInterval).nullish(),
// 	interval_count: z.number().nullish(),
// 	unlimited: z.boolean().nullish(),
// 	balance: z.number().nullish(), //
// 	usage: z.number().nullish(),
// 	included_usage: z.number().nullish(),
// 	next_reset_at: z.number().nullish(),
// 	overage_allowed: z.boolean().nullish(),
// 	usage_limit: z.number().nullish(),
// 	rollovers: z.array(CusRolloverSchema).nullish(),
// });

// export const CoreCusFeatureResponseSchema = z.object({
// 	interval: z.nativeEnum(EntInterval).or(z.literal("multiple")).nullish(),
// 	interval_count: z.number().nullish(),
// 	unlimited: z.boolean().nullish(),
// 	balance: z.number().nullish(),
// 	usage: z.number().nullish(),
// 	included_usage: z.number().nullish(),
// 	next_reset_at: z.number().nullish(),
// 	overage_allowed: z.boolean().nullish(),

// 	breakdown: z
// 		.array(
// 			z.object({
// 				interval: z.nativeEnum(EntInterval),
// 				interval_count: z.number().nullish(),
// 				balance: z.number().nullish(),
// 				usage: z.number().nullish(),
// 				included_usage: z.number().nullish(),
// 				next_reset_at: z.number().nullish(),
// 			}),
// 		)
// 		.nullish(),
// 	credit_schema: z
// 		.array(
// 			z.object({
// 				feature_id: z.string(),
// 				credit_amount: z.number(),
// 			}),
// 		)
// 		.nullish(),

// 	usage_limit: z.number().nullish(),
// 	rollovers: z.array(CusRolloverSchema).nullish(),
// });

// export const CusEntResponseV2Schema = z
// 	.object({
// 		id: z.string(),
// 		type: z.nativeEnum(ProductItemFeatureType),
// 		name: z.string().nullish(),
// 	})
// 	.extend(CoreCusFeatureResponseSchema.shape);

// export const CheckResponseSchema = z
// 	.object({
// 		allowed: z.boolean(),
// 		customer_id: z.string(),
// 		feature_id: z.string(),
// 		entity_id: z.string().nullish(),
// 		required_balance: z.number(),
// 		code: z.string(),
// 	})
// 	.extend(CoreCusFeatureResponseSchema.shape);

// export type CusEntResponse = z.infer<typeof CusEntResponseSchema>;
// export type CusEntResponseV2 = z.infer<typeof CusEntResponseV2Schema>;
// export type CheckResponse = z.infer<typeof CheckResponseSchema>;
// export type CusRollover = z.infer<typeof CusRolloverSchema>;
