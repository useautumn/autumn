import { EntInterval } from "@models/productModels/entModels/entEnums.js";
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
 *
 * FEATURE TYPES AND THEIR RESPONSE STRUCTURES:
 *
 * 1. BOOLEAN FEATURES:
 *    - Simple on/off features (e.g., "figma-integration", "apply-code")
 *    - interval: null (always null for boolean features)
 *    - Other fields (unlimited, balance, used) are omitted/undefined
 *
 * 2. UNLIMITED FEATURES:
 *    - Features with no usage limits (e.g., "deepseek-messages")
 *    - unlimited: true
 *    - interval: null (no reset period needed)
 *    - balance: null (no balance to track)
 *    - used: null (no usage counting)
 *
 * 3. REGULAR (METERED) FEATURES:
 *    - Features with usage limits and tracking (e.g., "chat-messages")
 *    - unlimited: false
 *    - interval: "month" | "year" | "week" | "day" (reset period)
 *    - balance: number (remaining usage)
 *    - used: number (amount consumed)
 */
export const ApiCusFeatureV0Schema = z.object({
	feature_id: z.string(),
	unlimited: z.boolean().nullish(),
	interval: z.enum(EntInterval).nullish(),
	balance: z.number().nullish(),
	used: z.number().nullish(),
});

/**
 * EXAMPLES OF EACH FEATURE TYPE:
 *
 * Boolean Feature:
 * {
 *   "feature_id": "figma-integration",
 *   "interval": null
 * }
 *
 * {
 *   "feature_id": "apply-code",
 *   "unlimited": true,
 *   "interval": null,
 *   "balance": null,
 *   "used": null
 * }
 *
 * Unlimited Feature:
 * {
 *   "feature_id": "deepseek-messages",
 *   "unlimited": true,
 *   "interval": null,
 *   "balance": null,
 *   "used": null
 * }
 *
 * Regular/Metered Feature:
 * {
 *   "feature_id": "chat-messages",
 *   "unlimited": false,
 *   "interval": "month",
 *   "balance": 1000,
 *   "used": 0
 * }
 */

/**
 * ApiCusFeatureV1Schema - Second version of customer feature API model, includes additional fields...
 */
export const ApiCusFeatureV1Schema = z.object({
	feature_id: z.string(),
	unlimited: z.boolean().nullish(),
	interval: z.enum(EntInterval).nullish(),
	balance: z.number().nullish(),
	used: z.number().nullish(),
});

// // OLD CUS FEATURE RESPONSE
// export const CusEntResponseSchema = z.object({
// 	feature_id: z.string(),
// 	interval: z.enum(EntInterval).nullish(),
// 	interval_count: z.number().nullish(),
// 	unlimited: z.boolean().nullish(),
// 	balance: z.number().nullish(), //
// 	usage: z.number().nullish(),
// 	included_usage: z.number().nullish(),
// 	next_reset_at: z.number().nullish(),
// 	overage_allowed: z.boolean().nullish(),
// 	usage_limit: z.number().nullish(),
// 	// rollovers: z.array(ApiCusRolloverSchema).nullish(),
// });

// // NEW CUS FEATURE RESPONSE
// export const CoreCusFeatureSchema = z.object({
// 	interval: z.enum(EntInterval).or(z.literal("multiple")).nullish(),
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
// 				interval: z.enum(EntInterval),
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
// 	rollovers: z.array(ApiCusRolloverSchema).nullish(),
// });

// export const ApiCusFeatureSchema = z
// 	.object({
// 		id: z.string(),
// 		type: z.enum(ProductItemFeatureType),
// 		name: z.string().nullish(),
// 	})
// 	.extend(CoreCusFeatureSchema.shape);

// export type CusEntResponse = z.infer<typeof CusEntResponseSchema>;
// export type CusEntResponseV2 = z.infer<typeof ApiCusFeatureSchema>;
// export type ApiCusRollover = z.infer<typeof ApiCusRolloverSchema>;
