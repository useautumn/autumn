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
 * Minimal fields: only feature_id, unlimited, interval, balance, used
 */
export const ApiCusFeatureV0Schema = z.object({
	feature_id: z.string(),
	unlimited: z.boolean().nullish(),
	interval: z.enum(EntInterval).nullish(),
	balance: z.number().nullish(),
	used: z.number().nullish(),
});

export type ApiCusFeatureV0 = z.infer<typeof ApiCusFeatureV0Schema>;

/**
 * EXAMPLES V0:
 *
 * Boolean Feature:
 * {
 *   "feature_id": "figma-integration",
 *   "interval": null
 * }
 *
 * Unlimited Feature:
 * {
 *   "feature_id": "apply-code",
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
 *   "balance": 591,
 *   "used": 409
 * }
 */
