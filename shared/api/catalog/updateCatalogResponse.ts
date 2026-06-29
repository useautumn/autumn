import { ApiFeatureV1Schema } from "@api/features/apiFeatureV1.js";
import { ApiPlanV1Schema } from "@api/products/apiPlanV1.js";
import { z } from "zod/v4";

export const CatalogUpdateResponseSchema = z.object({
	plans: z.array(ApiPlanV1Schema),
	features: z.array(ApiFeatureV1Schema),
});

export type CatalogUpdateResponse = z.infer<
	typeof CatalogUpdateResponseSchema
>;
