import { z } from "zod/v4";
import { LicenseCustomizeSchema } from "../../../../models/licenseModels/licenseModels.js";

/** One `licenses[]` entry on plan create/update: the license offered under this parent.
 * `customize` changes only this link; the license plan itself stays shared. */
export const PlanLicenseParamsSchema = z.object({
	license_plan_id: z.string(),
	/** Child version to anchor to. Stated = that slug's row; omitted keeps the existing link (new links use the child's active row). */
	version_slug: z.string().optional(),
	included: z.number().int().min(0).optional(),
	prepaid_only: z.boolean().optional(),
	customize: LicenseCustomizeSchema.nullish(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PlanLicenseParams = z.infer<typeof PlanLicenseParamsSchema>;
