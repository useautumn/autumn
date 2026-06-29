import { z } from "zod/v4";
import { CorePlanUpdatePreviewSchema } from "./corePlanUpdatePreview.js";
import { PlanUpdatePreviewVariantConflictSchema } from "./planUpdatePreviewVariantConflict.js";

export const PlanUpdatePreviewOtherVersionSchema =
	CorePlanUpdatePreviewSchema.extend({
		version: z.number().meta({
			description:
				"The historical plan version being previewed with the same diff fields as the primary preview.",
		}),
		conflicts: z
			.array(PlanUpdatePreviewVariantConflictSchema)
			.default([])
			.meta({
				description:
					"Potential conflicts that make applying the diff to this version ambiguous.",
			}),
	});

export type PlanUpdatePreviewOtherVersion = z.infer<
	typeof PlanUpdatePreviewOtherVersionSchema
>;
