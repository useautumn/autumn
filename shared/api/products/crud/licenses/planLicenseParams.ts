import { z } from "zod/v4";
import { LicenseCustomizeSchema } from "../../../../models/licenseModels/licenseModels.js";

export const PlanLicenseParamsSchema = z.object({
	license_plan_id: z.string(),
	version_slug: z.string().optional(),
	included: z.number().int().min(0).optional(),
	prepaid_only: z.boolean().optional(),
	customize: LicenseCustomizeSchema.nullish(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PlanLicenseParams = z.infer<typeof PlanLicenseParamsSchema>;
