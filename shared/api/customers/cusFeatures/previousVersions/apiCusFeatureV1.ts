import { z } from "zod/v4";
import { ApiCusFeatureV0Schema } from "./apiCusFeatureV0.js";

export const ApiCusFeatureV1Schema = ApiCusFeatureV0Schema.extend({
	next_reset_at: z.number().nullish(),
	allowance: z.number().nullish(),
	usage_limit: z.number().nullish(),
});

export type ApiCusFeatureV1 = z.infer<typeof ApiCusFeatureV1Schema>;
