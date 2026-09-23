import { PlanLicenseRowSchema } from "@autumn/shared";
import { z } from "zod/v4";
import { nonEmptyStringSchema } from "../common/primitives.js";

/** A plan license with the catalog rows its effective product is made of: the customized overlay's items, else the license product's base items. Scoped by its license product's org and env, as an invalidation names them. */
export const catalogPlanLicenseSchema = PlanLicenseRowSchema.extend({
	org_id: nonEmptyStringSchema,
	env: nonEmptyStringSchema,
	price_ids: z.array(nonEmptyStringSchema),
	entitlement_ids: z.array(nonEmptyStringSchema),
	internal_feature_ids: z.array(nonEmptyStringSchema),
});

export type CatalogPlanLicense = z.infer<typeof catalogPlanLicenseSchema>;
