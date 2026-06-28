import { z } from "zod/v4";
import { CorePlanUpdatePreviewSchema } from "./components/corePlanUpdatePreview.js";
import { PlanUpdatePreviewOtherVersionSchema } from "./components/planUpdatePreviewOtherVersion.js";
import { PlanUpdatePreviewVariantSchema } from "./components/planUpdatePreviewVariant.js";

export const PlanUpdatePreviewSchema = CorePlanUpdatePreviewSchema.extend({
	variants: z.array(PlanUpdatePreviewVariantSchema).default([]).meta({
		description:
			"Variant plans affected by this previewed update. Empty when no variants are included.",
	}),
	other_versions: z
		.array(PlanUpdatePreviewOtherVersionSchema)
		.default([])
		.meta({
			description:
				"Historical versions of this plan that can receive the same update diff.",
		}),
});

export type PlanUpdatePreview = z.infer<typeof PlanUpdatePreviewSchema>;
