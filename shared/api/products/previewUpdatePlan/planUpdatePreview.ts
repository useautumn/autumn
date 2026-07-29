import { z } from "zod/v4";
import { CorePlanUpdatePreviewSchema } from "./components/corePlanUpdatePreview.js";
import { PlanUpdatePreviewLicenseParentSchema } from "./components/planUpdatePreviewLicenseParent.js";
import { PlanUpdatePreviewOtherVersionSchema } from "./components/planUpdatePreviewOtherVersion.js";
import { PlanUpdatePreviewVariantSchema } from "./components/planUpdatePreviewVariant.js";

export const PlanUpdatePreviewSchema = CorePlanUpdatePreviewSchema.extend({
	license_parents: z
		.array(PlanUpdatePreviewLicenseParentSchema)
		.default([])
		.meta({
			description:
				"Parent plan versions that can receive this license-plan update.",
		}),
	variants: z.array(PlanUpdatePreviewVariantSchema).default([]).meta({
		description:
			"Variant plan versions affected by this previewed update. Empty when no variants are included.",
	}),
	other_versions: z
		.array(PlanUpdatePreviewOtherVersionSchema)
		.default([])
		.meta({
			description:
				"Historical versions of this plan that can receive the same update diff, including customize, price_change, item_changes, and previous_attributes.",
		}),
});

export type PlanUpdatePreview = z.infer<typeof PlanUpdatePreviewSchema>;
