import { z } from "zod/v4";
import { CreatePlanItemParamsV1Schema } from "../../api/products/items/crud/createPlanItemParamsV1";
import { UpdateProductV2ParamsSchema } from "../../api/products/productOpModels";
import { ProductCatalogType } from "../productModels/productEnums";

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
	included_quantity: z.number(),
	allow_extra_quantity: z.boolean(),
	customize: LicenseCustomizeSchema.nullish(),
	metadata: z.record(z.string(), z.unknown()).nullish(),
	created_at: z.number(),
	updated_at: z.number(),
});

export const LicensePoolSchema = z.object({
	id: z.string(),
	org_id: z.string(),
	env: z.string(),
	internal_customer_id: z.string(),
	parent_customer_product_id: z.string(),
	plan_license_id: z.string(),
	license_internal_product_id: z.string(),
	license_customer_product_id: z.string().nullable(),
	created_at: z.number(),
	updated_at: z.number(),
});

export const LicenseAssignmentSchema = z.object({
	id: z.string(),
	org_id: z.string(),
	env: z.string(),
	license_pool_id: z.string(),
	internal_customer_id: z.string(),
	internal_entity_id: z.string(),
	license_internal_product_id: z.string(),
	provisioned_customer_product_id: z.string().nullable(),
	started_at: z.number(),
	ended_at: z.number().nullable(),
	metadata: z.record(z.string(), z.unknown()).nullish(),
});

export const LicenseAssignParamsSchema = z.object({
	customer_id: z.string(),
	entity_id: z.string(),
	plan_id: z.string(),
	version: z.number().optional(),
	parent_subscription_id: z.string().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const SetPlanLicenseParamsSchema = z.object({
	parent_plan_id: z.string(),
	license_plan_id: z.string(),
	included_quantity: z.number().int().min(0).default(0),
	allow_extra_quantity: z.boolean().default(false),
	customize: LicenseCustomizeSchema.nullish().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ListPlanLicensesParamsSchema = z.object({
	parent_plan_id: z.string(),
});

export const LicenseUnassignParamsSchema = z.object({
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

export const LicenseUpdateParamsSchema = UpdateProductV2ParamsSchema.extend({
	license_plan_id: z.string(),
	version: z.number().optional(),
	catalog_type: z.literal(ProductCatalogType.License).optional(),
});

export const LicenseInventorySchema = z.object({
	included_quantity: z.number(),
	paid_quantity: z.number(),
	assigned: z.number(),
	available: z.number(),
});

export const LicenseAssignmentResponseSchema = z.object({
	id: z.string(),
	license_product_id: z.string(),
	entity_id: z.string(),
	started_at: z.number(),
	ended_at: z.number().nullable(),
	metadata: z.record(z.string(), z.unknown()).nullish(),
	inventory: LicenseInventorySchema.optional(),
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
export type LicensePool = z.infer<typeof LicensePoolSchema>;
export type LicenseAssignment = z.infer<typeof LicenseAssignmentSchema>;
export type LicenseAssignParams = z.infer<typeof LicenseAssignParamsSchema>;
export type SetPlanLicenseParams = z.infer<typeof SetPlanLicenseParamsSchema>;
export type ListPlanLicensesParams = z.infer<
	typeof ListPlanLicensesParamsSchema
>;
export type LicenseUnassignParams = z.infer<typeof LicenseUnassignParamsSchema>;
export type LicenseListAssignmentsParams = z.infer<
	typeof LicenseListAssignmentsParamsSchema
>;
export type LicenseListPoolsParams = z.infer<
	typeof LicenseListPoolsParamsSchema
>;
export type LicenseUpdateParams = z.infer<typeof LicenseUpdateParamsSchema>;
export type LicenseAssignmentResponse = z.infer<
	typeof LicenseAssignmentResponseSchema
>;
export type LicensePoolResponse = z.infer<typeof LicensePoolResponseSchema>;
