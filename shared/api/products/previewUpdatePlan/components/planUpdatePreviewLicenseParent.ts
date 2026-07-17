import { z } from "zod/v4";
import { CorePlanUpdatePreviewSchema } from "./corePlanUpdatePreview.js";
import { PlanUpdatePreviewVariantConflictSchema } from "./planUpdatePreviewVariantConflict.js";

export const PlanUpdatePreviewLicenseParentSchema =
	CorePlanUpdatePreviewSchema.extend({
		plan_id: z.string().meta({
			description: "The ID of the parent plan offering this license.",
		}),
		version: z.number().meta({
			description: "The parent plan version containing this license link.",
		}),
		name: z.string().meta({
			description: "The display name of the parent plan.",
		}),
		plan_license_id: z.string().meta({
			description: "The catalog link affected by this child-plan update.",
		}),
		will_apply: z.boolean().meta({
			description:
				"Whether this parent version is selected to receive the child-plan update.",
		}),
		update_source: z.enum(["direct", "propagated"]).nullable().optional().meta({
			description:
				"Whether the parent change is direct or propagated from the child plan.",
		}),
		conflicts: z
			.array(PlanUpdatePreviewVariantConflictSchema)
			.default([])
			.meta({
				description:
					"Parent customizations that overlap the proposed child-plan update.",
			}),
	});

export type PlanUpdatePreviewLicenseParent = z.infer<
	typeof PlanUpdatePreviewLicenseParentSchema
>;
