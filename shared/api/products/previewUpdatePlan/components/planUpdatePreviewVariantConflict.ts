import { PlanItemFilterSchema } from "../../items/filter/planItemFilter.js";
import { z } from "zod/v4";

export const PlanUpdatePreviewVariantConflictSchema = z.object({
	item_filter: PlanItemFilterSchema.meta({
		description:
			"Filter identifying the variant item whose shape makes automatic propagation ambiguous.",
	}),
	feature_name: z.string().optional().meta({
		description:
			"Display name of the conflicting feature, when available for the preview.",
	}),
	reason: z.enum(["different_interval"]).meta({
		description:
			"Why automatic propagation may be ambiguous for this variant feature.",
	}),
});

export type PlanUpdatePreviewVariantConflict = z.infer<
	typeof PlanUpdatePreviewVariantConflictSchema
>;
