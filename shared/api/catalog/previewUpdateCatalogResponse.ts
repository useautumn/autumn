import { ApiFeatureV1Schema } from "@api/features/apiFeatureV1.js";
import { MigrationFilterSchema } from "@api/migrations/filters/migrationFilter.js";
import { OperationsSchema } from "@api/migrations/operations/operations.js";
import { ApiPlanV1Schema } from "@api/products/apiPlanV1.js";
import { z } from "zod/v4";

/** Draft migration that would move existing customers onto the new plan shape. */
export const MigrationDraftSchema = z.object({
	id: z.string(),
	filter: MigrationFilterSchema,
	operations: OperationsSchema,
	no_billing_changes: z.boolean(),
});

/** Resolved preview for a single plan in the proposed catalog change. */
export const CatalogPlanPreviewSchema = z.object({
	plan: ApiPlanV1Schema,
	// In-place edits to a plan with customers force a new version instead.
	will_version: z.boolean(),
	has_customers: z.boolean(),
	migration_draft: MigrationDraftSchema.nullable(),
});

export type CatalogPlanPreview = z.infer<typeof CatalogPlanPreviewSchema>;

/** Reason a feature update would be rejected, surfaced before the write is attempted. */
export const FeatureUpdateBlockerSchema = z.object({
	field: z.enum(["type", "id", "usage_type"]),
	code: z.enum([
		"type_switch_credit_system",
		"attached_to_customer",
		"used_as_entity_feature",
		"has_usage_price",
		"used_in_credit_system",
		"used_in_product_credit_system",
		"id_already_exists",
	]),
	message: z.string(),
});

export type FeatureUpdateBlocker = z.infer<typeof FeatureUpdateBlockerSchema>;
export type FeatureUpdateBlockerCode = FeatureUpdateBlocker["code"];

/** Resolved preview for a single feature, with any blocking update conditions. */
export const CatalogFeaturePreviewSchema = z.object({
	feature: ApiFeatureV1Schema,
	blockers: z.array(FeatureUpdateBlockerSchema),
});

export type CatalogFeaturePreview = z.infer<typeof CatalogFeaturePreviewSchema>;

/** Response for `catalog.preview_update`: resolved plans + features, unpersisted. */
export const CatalogPreviewUpdateResponseSchema = z.object({
	plans: z.array(CatalogPlanPreviewSchema),
	features: z.array(CatalogFeaturePreviewSchema),
});

export type CatalogPreviewUpdateResponse = z.infer<
	typeof CatalogPreviewUpdateResponseSchema
>;
