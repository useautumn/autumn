import { z } from "zod/v4";
import { CorePlanUpdatePreviewSchema } from "./corePlanUpdatePreview.js";
import { PlanUpdatePreviewVariantConflictSchema } from "./planUpdatePreviewVariantConflict.js";

export const PlanUpdatePreviewVariantSchema =
	CorePlanUpdatePreviewSchema.extend({
		plan_id: z.string().meta({
			description: "The ID of the variant plan being previewed.",
		}),
		version: z.number().meta({
			description: "The version of the variant plan being previewed.",
		}),
		name: z.string().meta({
			description: "The display name of the variant plan being previewed.",
		}),
		will_apply: z.boolean().meta({
			description:
				"Whether this variant is included in update_variant_ids and would receive the base plan diff.",
		}),
		previous_attributes: z.record(z.string(), z.unknown()).nullable().meta({
			description:
				"Sparse map of non-price scalar variant plan fields whose values changed, holding their previous values. Null when there is no previous variant plan.",
		}),
		conflicts: z
			.array(PlanUpdatePreviewVariantConflictSchema)
			.default([])
			.meta({
				description:
					"Potential conflicts that make automatic propagation ambiguous for this variant. Empty when no conflicts are detected.",
			}),
	});

export type PlanUpdatePreviewVariant = z.infer<
	typeof PlanUpdatePreviewVariantSchema
>;
