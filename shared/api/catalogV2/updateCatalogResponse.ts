import { ApiFeatureV1Schema } from "@api/features/apiFeatureV1.js";
import { ApiPlanV1Schema } from "@api/products/apiPlanV1.js";
import { z } from "zod/v4";
import { CatalogActionSchema } from "./components/catalogAction.js";

const CatalogAppliedResultSchema = z.object({
	id: z.string(),
	action: CatalogActionSchema.meta({
		description: "What was actually applied, including 'skip' and 'none'.",
	}),
});

/** Resolved post-update state plus what was actually done per requested entry. */
export const UpdateCatalogResponseSchema = z.object({
	plans: z.array(ApiPlanV1Schema),
	features: z.array(ApiFeatureV1Schema),
	results: z.object({
		plans: z.array(CatalogAppliedResultSchema),
		features: z.array(CatalogAppliedResultSchema),
	}),
});

export type UpdateCatalogResponse = z.infer<typeof UpdateCatalogResponseSchema>;
