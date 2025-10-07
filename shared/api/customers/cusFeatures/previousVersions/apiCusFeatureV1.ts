import { EntInterval } from "@models/productModels/entModels/entEnums.js";
import { z } from "zod/v4";

/**
 * ApiCusFeatureV1Schema - Second version of the customer feature API model
 * Added: next_reset_at, allowance, usage_limit fields
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
export const ApiCusFeatureV1Schema = z.object({
	feature_id: z.string(),
	unlimited: z.boolean().nullish(),
	interval: z.enum(EntInterval).nullish(),
	balance: z.number().nullish(),
	used: z.number().nullish(),
	next_reset_at: z.number().nullish(),
	allowance: z.number().nullish(),
	usage_limit: z.number().nullish(),
});

export type ApiCusFeatureV1 = z.infer<typeof ApiCusFeatureV1Schema>;

/**
 * EXAMPLES V1:
 *
 * Boolean Feature:
 * {
 *   "feature_id": "pro-access",
 *   "interval": null
 * }
 *
 * Unlimited Feature:
 * {
 *   "feature_id": "projects",
 *   "unlimited": true,
 *   "interval": null,
 *   "balance": null,
 *   "used": null
 * }
 *
 * Regular/Metered Feature:
 * {
 *   "feature_id": "translated-words",
 *   "unlimited": false,
 *   "interval": "month",
 *   "balance": -306981,
 *   "used": 326981,
 *   "next_reset_at": 1760549553168,
 *   "allowance": 20000,
 *   "usage_limit": 20000
 * }
 */
