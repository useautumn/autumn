import { z } from "zod/v4";
import { CreatePlanItemParamsV1Schema } from "../../api/products/items/crud/createPlanItemParamsV1";

export const LicenseCustomizeSchema = z
	.object({
		items: z.array(CreatePlanItemParamsV1Schema),
	})
	.refine((customize) => customize.items.every((item) => !item.price), {
		message: "License customize.items cannot include priced items.",
	});

export const PlanLicenseSchema = z.object({
	id: z.string(),
	parent_plan_id: z.string(),
	license_plan_id: z.string(),
	included: z.number(),
	prepaid_only: z.boolean(),
	pooled_feature_ids: z.array(z.string()).default([]),
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
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const SetPlanLicenseParamsSchema = z.object({
	parent_plan_id: z.string(),
	license_plan_id: z.string(),
	included: z.number().int().min(0).default(0),
	prepaid_only: z.boolean().default(true),
	pooled_feature_ids: z.array(z.string()).default([]),
	customize: LicenseCustomizeSchema.nullish().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const CustomizePlanLicenseSchema = SetPlanLicenseParamsSchema.omit({
	parent_plan_id: true,
});

export const ListPlanLicensesParamsSchema = z.object({
	parent_plan_id: z.string(),
});

export const LicenseDetachParamsSchema = z.object({
	assignment_id: z.string().optional(),
	customer_id: z.string().optional(),
	entity_id: z.string().optional(),
	plan_id: z.string().optional(),
});

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
