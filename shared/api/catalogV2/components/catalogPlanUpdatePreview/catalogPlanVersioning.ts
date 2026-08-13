import { z } from "zod/v4";
import { CatalogPlanVersioningStrategySchema } from "../updateCatalogPlanParams.js";

/** Null on the parent preview when versioning doesn't apply (create / delete / skip). */
export const CatalogPlanVersioningSchema = z.object({
	current_version: z.number().int(),
	new_version: z.number().int().nullable().meta({
		description:
			"Version that applying would create. Null when the update edits an existing row.",
	}),
	resolved: CatalogPlanVersioningStrategySchema.meta({
		description:
			"What actually happens to this plan with the requested params.",
	}),
	options: z.array(CatalogPlanVersioningStrategySchema).meta({
		description:
			"Strategies the caller can pick for this plan update today.",
	}),
});

export type CatalogPlanVersioning = z.infer<typeof CatalogPlanVersioningSchema>;
