import { z } from "zod/v4";
import { CorePlanUpdatePreviewSchema } from "./components/corePlanUpdatePreview.js";
import { PlanUpdatePreviewVariantSchema } from "./components/planUpdatePreviewVariant.js";

export const PlanUpdatePreviewSchema = CorePlanUpdatePreviewSchema.extend({
	variants: z.array(PlanUpdatePreviewVariantSchema).default([]).meta({
		description:
			"Variant plans affected by this previewed update. Empty when no variants are included.",
	}),
});

export type PlanUpdatePreview = z.infer<typeof PlanUpdatePreviewSchema>;
