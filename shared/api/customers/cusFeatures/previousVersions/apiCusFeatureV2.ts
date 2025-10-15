import { EntInterval } from "@models/productModels/entModels/entEnums.js";
import { z } from "zod/v4";
import { ApiCusRolloverSchema } from "../apiCusFeature.js";

// Version 2 of cus feature response
export const ApiCusFeatureV2Schema = z.object({
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
	rollovers: z.array(ApiCusRolloverSchema).nullish(),
});

export type ApiCusFeatureV2 = z.infer<typeof ApiCusFeatureV2Schema>;
