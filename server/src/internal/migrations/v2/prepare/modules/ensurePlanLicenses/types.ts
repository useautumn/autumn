import {
	type DbPlanLicense,
	EntitlementSchema,
	type PlanItemFilter,
} from "@autumn/shared";
import { z } from "zod/v4";

export const PreparedPlanLicenseRefSchema = z.object({
	op_index: z.number(),
	license_plan_id: z.string(),
	item_index: z.number(),
	hash: z.string(),
	parent_internal_product_id: z.string(),
	license_internal_product_id: z.string(),
	is_one_off: z.boolean(),
	plan_license_id: z.string(),
	entitlement_id: z.string().optional(),
	internal_feature_id: z.string(),
	replaces_entitlement_id: z.string().optional(),
	removes_filter: z.custom<PlanItemFilter>().optional(),
	base_item_refs: z.array(
		z.object({
			entitlementId: z.string().optional(),
			priceId: z.string().optional(),
			internalFeatureId: z.string().optional(),
		}),
	),
});

export type PreparedPlanLicenseRef = z.infer<
	typeof PreparedPlanLicenseRefSchema
>;

/** Stored under the module key in `migrations.prepared_state`. */
export const EnsurePlanLicensesResultSchema = z.object({
	planLicenses: z.array(z.custom<DbPlanLicense>()),
	entitlements: z.array(EntitlementSchema),
	artifacts: z.array(PreparedPlanLicenseRefSchema),
});

export type EnsurePlanLicensesResult = z.infer<
	typeof EnsurePlanLicensesResultSchema
>;

export const EnsurePlanLicensesModuleResultSchema = z.object({
	key: z.string(),
	kind: z.literal("ensure_plan_licenses"),
	result: EnsurePlanLicensesResultSchema,
});

export type EnsurePlanLicensesModuleResult = z.infer<
	typeof EnsurePlanLicensesModuleResultSchema
>;
