import { z } from "zod/v4";
import { PlanUpdatePreviewLicenseChangeSchema } from "./planUpdatePreviewLicense.js";
import { PlanUpdatePreviewPlanChangesSchema } from "./planUpdatePreviewPlanChanges.js";

export const CorePlanUpdatePreviewSchema =
	PlanUpdatePreviewPlanChangesSchema.extend({
		has_customers: z.boolean().meta({
			description:
				"Whether the current plan has customers that could be affected by applying this update.",
		}),
		customer_count: z.number().default(0).meta({
			description:
				"Number of customers on this plan version that are eligible to be migrated by this update.",
		}),
		versionable: z.boolean().meta({
			description:
				"Whether applying this update would create a new plan version under the current versioning flags.",
		}),
		license_changes: z
			.array(PlanUpdatePreviewLicenseChangeSchema)
			.default([])
			.meta({
				description:
					"License links that would be created, updated, or removed.",
			}),
	});

export type CorePlanUpdatePreview = z.infer<typeof CorePlanUpdatePreviewSchema>;
