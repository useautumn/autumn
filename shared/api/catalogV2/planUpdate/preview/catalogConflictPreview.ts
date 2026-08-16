import { PlanItemFilterSchema } from "@api/products/items/filter/planItemFilter.js";
import { z } from "zod/v4";

export const CatalogConflictPreviewSchema = z.object({
	item_filter: PlanItemFilterSchema.optional().meta({
		description:
			"Filter identifying the item whose shape makes follow ambiguous. Omitted for plan-level conflicts such as the base price.",
	}),
	feature_name: z.string().optional().meta({
		description:
			"Display name of the conflicting feature, when available for the preview.",
	}),
	reason: z
		.enum(["different_interval", "value_divergence", "base_price_divergence"])
		.meta({
			description:
				"Why follow may be ambiguous. `different_interval`: the relative holds the feature at an interval the edit doesn't touch. `value_divergence`: a customized value that follow would overwrite. `base_price_divergence`: a customized base price that follow would overwrite.",
		}),
});

export type CatalogConflictPreview = z.infer<
	typeof CatalogConflictPreviewSchema
>;
