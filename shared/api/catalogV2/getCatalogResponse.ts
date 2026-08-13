import { ApiFeatureV1Schema } from "@api/features/apiFeatureV1.js";
import { ApiPlanExpandedV1Schema } from "@api/products/apiPlanV1.js";
import { z } from "zod/v4";

/**
 * The entire catalog: features plus the latest version of each top-level plan,
 * with license plans and variants expanded. Variants appear ONLY nested under
 * their base — never as top-level plans.
 */
export const GetCatalogResponseSchema = z.object({
	features: z.array(ApiFeatureV1Schema),
	plans: z.array(ApiPlanExpandedV1Schema),
});

export type GetCatalogResponse = z.infer<typeof GetCatalogResponseSchema>;
