import { z } from "zod/v4";
import { ApiPlanLicenseV1Schema } from "../../apiPlanLicenseV1.js";
import { PlanChangeCoreV0Schema } from "./planChangeCoreV0.js";

/** Sparse planLicense-row scalars that changed, holding their previous values. */
export const PlanLicensePreviousAttributesV0Schema = ApiPlanLicenseV1Schema.pick(
	{
		version: true,
		version_slug: true,
		included: true,
		prepaid_only: true,
	},
).partial();

/**
 * One planLicense on this plan that was created, updated, or removed.
 * Nested `plan_change` is the effective child plan (null when created or removed,
 * or when only row scalars changed).
 */
export const PlanLicenseChangeV0Schema = ApiPlanLicenseV1Schema.extend({
	action: z.enum(["created", "updated", "removed"]).meta({
		description:
			"created = new planLicense; updated = row or effective content changed; removed = dropped.",
	}),
	previous_attributes: PlanLicensePreviousAttributesV0Schema.nullable().meta({
		description:
			"Previous included / prepaid_only / version. Null when created or removed, or when no row scalar changed.",
	}),
	plan_change: PlanChangeCoreV0Schema.nullish().meta({
		description:
			"Diff of the license's effective plan. Null when created, removed, or the effective content is unchanged.",
	}),
});

export type PlanLicensePreviousAttributesV0 = z.infer<
	typeof PlanLicensePreviousAttributesV0Schema
>;
export type PlanLicenseChangeV0 = z.infer<typeof PlanLicenseChangeV0Schema>;
