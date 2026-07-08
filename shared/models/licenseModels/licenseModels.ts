import { findDuplicate } from "@utils/utils";
import { z } from "zod/v4";
import { CreatePlanItemParamsV1Schema } from "../../api/products/items/crud/createPlanItemParamsV1";

export const LicenseCustomizeSchema = z.object({
	items: z.array(CreatePlanItemParamsV1Schema),
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

export const LicenseAttachParamsSchema = z.object({
	customer_id: z.string(),
	entity_id: z.string(),
	plan_id: z.string(),
	pool_id: z.string().optional(),
	parent_subscription_id: z.string().optional(),
});

export const SetPlanLicenseParamsSchema = z.object({
	parent_plan_id: z.string(),
	license_plan_id: z.string(),
	included: z.number().int().min(0).default(0),
	prepaid_only: z.boolean().default(true),
	customize: LicenseCustomizeSchema.nullish().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
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

export const ListPlanLicensesParamsSchema = z.object({
	parent_plan_id: z.string(),
});

export const LicenseDetachParamsSchema = z
	.object({
		assignment_id: z.string().optional(),
		customer_id: z.string().optional(),
		entity_id: z.string().optional(),
		plan_id: z.string().optional(),
	})
	.refine(
		(params) =>
			Boolean(
				params.assignment_id ||
					(params.customer_id && params.entity_id && params.plan_id),
			),
		{
			message: "Provide assignment_id or customer_id, entity_id, and plan_id.",
		},
	);

export const LicenseListAssignmentsParamsSchema = z.object({
	customer_id: z.string(),
	entity_id: z.string().optional(),
	plan_id: z.string().optional(),
	active: z.boolean().optional().default(true),
});

export const LicenseListPoolsParamsSchema = z.object({
	customer_id: z.string(),
	entity_id: z.string().optional(),
});

export const LicenseInventorySchema = z.object({
	included: z.number(),
	assigned: z.number(),
	available: z.number(),
});

export const LicensePoolResponseSchema = z.object({
	pool_id: z.string(),
	license_product_id: z.string(),
	license_product_name: z.string(),
	parent_subscription_id: z.string().optional(),
	inventory: LicenseInventorySchema,
	assignments: z.array(
		z.object({
			assignment_id: z.string(),
			entity_id: z.string(),
			license_product_id: z.string(),
			started_at: z.number(),
		}),
	),
});

export type LicensePatchParams = {
	add_licenses?: z.infer<typeof CustomizePlanLicenseSchema>[];
	remove_licenses?: string[];
};

export type PlanLicense = z.infer<typeof PlanLicenseSchema>;
export type LicenseCustomize = z.infer<typeof LicenseCustomizeSchema>;
export type LicenseAttachParams = z.infer<typeof LicenseAttachParamsSchema>;
export type SetPlanLicenseParams = z.infer<typeof SetPlanLicenseParamsSchema>;
export type CustomizePlanLicense = z.infer<typeof CustomizePlanLicenseSchema>;
export type ListPlanLicensesParams = z.infer<
	typeof ListPlanLicensesParamsSchema
>;
export type LicenseDetachParams = z.infer<typeof LicenseDetachParamsSchema>;
export type LicenseListAssignmentsParams = z.infer<
	typeof LicenseListAssignmentsParamsSchema
>;
export type LicenseListPoolsParams = z.infer<
	typeof LicenseListPoolsParamsSchema
>;
export type LicensePoolResponse = z.infer<typeof LicensePoolResponseSchema>;
