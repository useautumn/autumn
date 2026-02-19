import { EntInterval } from "@models/productModels/intervals/entitlementInterval";
import { z } from "zod/v4";

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
