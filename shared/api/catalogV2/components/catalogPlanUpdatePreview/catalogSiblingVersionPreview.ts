import { PlanChangeV0Schema } from "@api/products/components/planChange/planChangeV0.js";
import { z } from "zod/v4";

/** Another existing version of this entry's plan. `selected` is whether `all_versions` applies the change there. */
export const CatalogSiblingVersionPreviewSchema = z.object({
	version: z.number().int().min(1),
	selected: z.boolean().meta({
		description:
			"True when versioning is `all_versions` and this version receives the change.",
	}),
	state: z.object({
		has_customers: z.boolean(),
	}),
	plan_change: PlanChangeV0Schema.nullish().meta({
		description:
			"Diff this version receives. Present only when selected.",
	}),
});

export type CatalogSiblingVersionPreview = z.infer<
	typeof CatalogSiblingVersionPreviewSchema
>;
