import { type DbPlanLicense, EntitlementSchema } from "@autumn/shared";
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
	/** Absent on a removal: nothing is minted, the base ref is only dropped. */
	entitlement_id: z.string().optional(),
	internal_feature_id: z.string(),
	/** The base entitlement this minted row replaces, when the customize
	 * re-adds a feature the license plan already grants. */
	replaces_entitlement_id: z.string().optional(),
	/** The base entitlement a remove_items filter drops, with nothing minted. */
	removes_entitlement_id: z.string().optional(),
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
