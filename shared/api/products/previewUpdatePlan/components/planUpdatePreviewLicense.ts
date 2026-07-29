import { z } from "zod/v4";
import { ApiPlanLicenseV1Schema } from "../../apiPlanV1.js";
import { PlanUpdatePreviewPlanChangesSchema } from "./planUpdatePreviewPlanChanges.js";

const PlanLicensePreviousAttributesSchema = ApiPlanLicenseV1Schema.pick({
	version: true,
	included: true,
	prepaid_only: true,
}).partial();

export const PlanUpdatePreviewLicenseChangeSchema =
	ApiPlanLicenseV1Schema.extend({
		action: z.enum(["create", "update", "remove"]),
		previous_attributes: PlanLicensePreviousAttributesSchema.nullable().meta({
			description:
				"Previous link-level values that changed. Null when link fields are unchanged or the license is new.",
		}),
		plan_changes: PlanUpdatePreviewPlanChangesSchema.nullable().meta({
			description:
				"Changes to this parent link's effective license plan. Null when only link-level fields changed.",
		}),
	});

export type PlanUpdatePreviewLicenseChange = z.infer<
	typeof PlanUpdatePreviewLicenseChangeSchema
>;
