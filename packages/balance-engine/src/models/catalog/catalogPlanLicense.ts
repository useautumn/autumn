import { PlanLicenseRowSchema } from "@autumn/shared";
import { z } from "zod/v4";
import { nonEmptyStringSchema } from "../common/primitives.js";

export const catalogPlanLicenseSchema = PlanLicenseRowSchema.extend({
	org_id: nonEmptyStringSchema,
	env: nonEmptyStringSchema,
	price_ids: z.array(nonEmptyStringSchema),
	entitlement_ids: z.array(nonEmptyStringSchema),
	internal_feature_ids: z.array(nonEmptyStringSchema),
});

export type CatalogPlanLicense = z.infer<typeof catalogPlanLicenseSchema>;
