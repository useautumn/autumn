import { findDuplicate } from "@utils/utils";
import { z } from "zod/v4";
import { BasePriceParamsSchema } from "../../api/products/components/basePrice/basePrice";
import { CreatePlanItemParamsV1Schema } from "../../api/products/items/crud/createPlanItemParamsV1";
import { PlanItemFilterSchema } from "../../api/products/items/filter/planItemFilter";

/** Diff-style customize applied on top of the license plan's own items —
 * price / items only. Licenses do not nest. */
export const LicenseCustomizeSchema = z.object({
	price: BasePriceParamsSchema.nullable().optional(),
	add_items: z.array(CreatePlanItemParamsV1Schema).optional(),
	remove_items: z.array(PlanItemFilterSchema).optional(),
});

export const PlanLicenseSchema = z.object({
	id: z.string(),
	parent_plan_id: z.string(),
	license_plan_id: z.string(),
	included: z.number(),
	prepaid_only: z.boolean(),
	customize: LicenseCustomizeSchema.nullish(),
	metadata: z.record(z.string(), z.unknown()).nullish(),
	created_at: z.number(),
	updated_at: z.number(),
});

export const CustomizePlanLicenseSchema = z.object({
	license_plan_id: z.string(),
	/** Child version to anchor to. Stated = that slug's row; omitted keeps the existing link (new links use the child's active row). */
	version_slug: z.string().optional(),
	included: z.number().int().min(0).optional(),
	prepaid_only: z.boolean().optional(),
	customize: LicenseCustomizeSchema.nullish(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

/** A planLicense dropped from a parent. Parallel to remove_items. */
export const RemovePlanLicenseSchema = z.object({
	license_plan_id: z.string(),
});

/** Structural issues in a license patch: duplicate license_plan_ids. */
export const licensePatchIssues = ({
	upsertLicenses = [],
}: {
	upsertLicenses?: { license_plan_id: string }[];
}): { message: string; path: string[] }[] => {
	const duplicate = findDuplicate(
		upsertLicenses.map((license) => license.license_plan_id),
	);
	if (duplicate === undefined) return [];
	return [
		{
			message: `Duplicate license ${duplicate} in upsert_licenses`,
			path: ["upsert_licenses"],
		},
	];
};

export const LicenseListAssignmentsParamsSchema = z.object({
	customer_id: z.string(),
	entity_id: z.string().optional(),
	plan_id: z.string().optional(),
	active: z.boolean().optional().default(true),
});

export const LicenseListParamsSchema = z.object({
	customer_id: z.string(),
	entity_id: z.string().optional(),
});

export type PlanLicense = z.infer<typeof PlanLicenseSchema>;
export type LicenseCustomize = z.infer<typeof LicenseCustomizeSchema>;
export type CustomizePlanLicense = z.infer<typeof CustomizePlanLicenseSchema>;
export type RemovePlanLicense = z.infer<typeof RemovePlanLicenseSchema>;
export type LicenseListAssignmentsParams = z.infer<
	typeof LicenseListAssignmentsParamsSchema
>;
export type LicenseListParams = z.infer<typeof LicenseListParamsSchema>;
