import { z } from "zod/v4";
import { LicenseCustomizeSchema } from "../../../../models/licenseModels/licenseModels.js";

/** One `licenses[]` entry on plan create/update: the license offered under this parent.
 * `customize` changes only this link; the license plan itself stays shared. */
export const PlanLicenseParamsSchema = z.object({
	license_plan_id: z.string(),
	included: z.number().int().min(0).optional(),
	prepaid_only: z.boolean().optional(),
	customize: LicenseCustomizeSchema.nullish(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	version: z.number().int().min(1).optional().meta({
		description:
			"Pin the link to a specific version of the license plan. Omitted, an existing link keeps its pinned version and a new link resolves to the latest.",
	}),
});

export type PlanLicenseParams = z.infer<typeof PlanLicenseParamsSchema>;
