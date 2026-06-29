import { z } from "zod/v4";
import { PlanItemFilterSchema } from "../../items/filter/planItemFilter.js";

export const PlanUpdatePreviewVariantConflictSchema = z.object({
	item_filter: PlanItemFilterSchema.optional().meta({
		description:
			"Filter identifying the variant item whose shape makes automatic propagation ambiguous. Omitted for plan-level conflicts such as the base price.",
	}),
	feature_name: z.string().optional().meta({
		description:
			"Display name of the conflicting feature, when available for the preview.",
	}),
	reason: z
		.enum(["different_interval", "value_divergence", "base_price_divergence"])
		.meta({
			description:
				"Why automatic propagation may be ambiguous for this variant. 'different_interval': the variant holds the feature at an interval the edit doesn't touch (propagation adds a duplicate). 'value_divergence': the variant has a customized value for the feature that propagation would overwrite. 'base_price_divergence': the variant has a customized base price that propagation would overwrite.",
		}),
});

export type PlanUpdatePreviewVariantConflict = z.infer<
	typeof PlanUpdatePreviewVariantConflictSchema
>;
