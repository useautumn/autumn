import { z } from "zod/v4";
import { ApiCusProductV0Schema } from "./apiCusProductV0.js";

/**
 * ApiCusProductV1Schema - Customer Product schema for API V1.0 (pre V0_2)
 *
 * Missing fields compared to V2:
 * - items: Product items were added in V0_2
 * - current_period_start: Period tracking added in V0_2
 * - current_period_end: Period tracking added in V0_2
 */
export const ApiCusProductV1Schema = ApiCusProductV0Schema.extend({
	current_period_end: z.number().nullish(),
	current_period_start: z.number().nullish(),
});

export type ApiCusProductV1 = z.infer<typeof ApiCusProductV1Schema>;
