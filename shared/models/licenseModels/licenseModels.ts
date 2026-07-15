import type { DiffedCustomizePlanV1 } from "@utils/planV1Utils/diff/diffPlanV1";
import { findDuplicate } from "@utils/utils";
import { z } from "zod/v4";
import { CreatePlanItemParamsV1Schema } from "../../api/products/items/crud/createPlanItemParamsV1";

export const LicenseCustomizeSchema = z.object({
	items: z.array(CreatePlanItemParamsV1Schema),
});

/** Typed via z.custom: the diffed zod schema is built from customizePlan
 * schemas that import this module at runtime (import cycle otherwise). */
export const DiffedLicenseCustomizeSchema = z.custom<DiffedCustomizePlanV1>();

export const PlanLicenseSchema = z.object({
	id: z.string(),
	parent_plan_id: z.string(),
	license_plan_id: z.string(),
	included: z.number(),
	prepaid_only: z.boolean(),
	customize: DiffedLicenseCustomizeSchema.nullish(),
	metadata: z.record(z.string(), z.unknown()).nullish(),
	created_at: z.number(),
	updated_at: z.number(),
});

export const CustomizePlanLicenseSchema = z.object({
	license_plan_id: z.string(),
	included: z.number().int().min(0).optional(),
	prepaid_only: z.boolean().optional(),
	customize: LicenseCustomizeSchema.nullish(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const CustomLicenseChangeSchema = z.object({
	parentCustomerProductId: z.string(),
	previousParentCustomerProductId: z.string().optional(),
	// Optional for deserialization of plans persisted before it existed.
	parentInternalProductId: z.string().optional(),
	adds: z.array(CustomizePlanLicenseSchema),
	removes: z.array(z.string()),
});

export type CustomLicenseChange = z.infer<typeof CustomLicenseChangeSchema>;

/** Structural issues in a license patch: duplicate ids, add/remove overlap. */
export const licensePatchIssues = ({
	addLicenses = [],
	removeLicenses = [],
}: {
	addLicenses?: { license_plan_id: string }[];
	removeLicenses?: string[];
}): { message: string; path: string[] }[] => {
	const issues: { message: string; path: string[] }[] = [];
	const addIds = addLicenses.map((license) => license.license_plan_id);

	const duplicateAdd = findDuplicate(addIds);
	if (duplicateAdd !== undefined) {
		issues.push({
			message: `Duplicate license ${duplicateAdd} in add_licenses`,
			path: ["add_licenses"],
		});
	}
	const duplicateRemove = findDuplicate(removeLicenses);
	if (duplicateRemove !== undefined) {
		issues.push({
			message: `Duplicate license ${duplicateRemove} in remove_licenses`,
			path: ["remove_licenses"],
		});
	}
	const addIdSet = new Set(addIds);
	const overlapping = removeLicenses.find((id) => addIdSet.has(id));
	if (overlapping !== undefined) {
		issues.push({
			message: `License ${overlapping} cannot appear in both add_licenses and remove_licenses`,
			path: ["remove_licenses"],
		});
	}
	return issues;
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

export type LicensePatchParams = {
	add_licenses?: z.infer<typeof CustomizePlanLicenseSchema>[];
	remove_licenses?: string[];
};

export type PlanLicense = z.infer<typeof PlanLicenseSchema>;
export type LicenseCustomize = z.infer<typeof LicenseCustomizeSchema>;
export type CustomizePlanLicense = z.infer<typeof CustomizePlanLicenseSchema>;
export type LicenseListAssignmentsParams = z.infer<
	typeof LicenseListAssignmentsParamsSchema
>;
export type LicenseListParams = z.infer<typeof LicenseListParamsSchema>;
