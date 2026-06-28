import { PreviewUpdateFeatureResponseSchema } from "@api/features/previewUpdateFeature/previewUpdateFeatureResponse.js";
import { MigrationFilterSchema } from "@api/migrations/filters/migrationFilter.js";
import { OperationsSchema } from "@api/migrations/operations/operations.js";
import { PlanUpdatePreviewSchema } from "@api/products/previewUpdatePlan/planUpdatePreview.js";
import { z } from "zod/v4";

/** Draft migration that would move existing customers onto the new plan shape. */
export const MigrationDraftSchema = z.object({
	id: z.string(),
	filter: MigrationFilterSchema,
	operations: OperationsSchema,
	no_billing_changes: z.boolean(),
});

export const CatalogMigrationPreviewSchema = z.object({
	draft: MigrationDraftSchema,
	plan_ids: z.array(z.string()),
	include_custom: z.boolean().default(false),
	has_billing_changes: z.boolean(),
});
export type CatalogMigrationPreview = z.infer<
	typeof CatalogMigrationPreviewSchema
>;

export const CatalogPlanPreviewActionSchema = z.enum([
	"created",
	"updated",
	"deleted",
	"skipped",
	"none",
]);

export const CatalogPlanPreviewSchema = PlanUpdatePreviewSchema.extend({
	action: CatalogPlanPreviewActionSchema.meta({
		description:
			"Whether the plan would be created, updated, deleted, or unchanged.",
	}),
	will_archive: z.boolean().optional().default(false).meta({
		description:
			"Whether applying this derived plan removal archives the plan instead of deleting it.",
	}),
	migration: CatalogMigrationPreviewSchema.optional().meta({
		description:
			"Migration draft that can be created if this plan is updated in place.",
	}),
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

export const CatalogFeaturePreviewSchema = PreviewUpdateFeatureResponseSchema;

export type CatalogFeaturePreview = z.infer<typeof CatalogFeaturePreviewSchema>;

/** Response for `catalog.preview_update`: resolved plans + features, unpersisted. */
export const CatalogPreviewUpdateResponseSchema = z.object({
	plan_changes: z.array(CatalogPlanPreviewSchema),
	feature_changes: z.array(CatalogFeaturePreviewSchema),
});

export type CatalogPreviewUpdateResponse = z.infer<
	typeof CatalogPreviewUpdateResponseSchema
>;
