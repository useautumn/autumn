import { CustomizePlanV1Schema } from "@api/billing/common/customizePlan/customizePlanV1.js";
import { ApiFeatureV1Schema } from "@api/features/apiFeatureV1.js";
import { MigrationFilterSchema } from "@api/migrations/filters/migrationFilter.js";
import { OperationsSchema } from "@api/migrations/operations/operations.js";
import { ApiPlanV1Schema } from "@api/products/apiPlanV1.js";
import { ApiPlanItemV1Schema } from "@api/products/items/apiPlanItemV1.js";
import { z } from "zod/v4";

/** Draft migration that would move existing customers onto the new plan shape. */
export const MigrationDraftSchema = z.object({
	id: z.string(),
	filter: MigrationFilterSchema,
	operations: OperationsSchema,
	no_billing_changes: z.boolean(),
});

/** Current → proposed diff, display-ready: full items on both sides (unlike
 * diffPlanV1's lossy remove_items filters) so the card can render real text. A
 * changed item appears in both lists (diffPlanV1 models a change as remove+add). */
export const PlanPreviewDiffSchema = z.object({
	added_items: z.array(ApiPlanItemV1Schema),
	removed_items: z.array(ApiPlanItemV1Schema),
	// undefined = unchanged, null = removed, value = added/changed.
	price: CustomizePlanV1Schema.shape.price,
});

export type PlanPreviewDiff = z.infer<typeof PlanPreviewDiffSchema>;

/** Resolved preview for a single plan in the proposed catalog change — the
 * full ApiPlanV1 plus the preview-only impact fields. */
export const CatalogPlanPreviewSchema = ApiPlanV1Schema.extend({
	// In-place edits to a plan with customers force a new version instead.
	will_version: z.boolean(),
	has_customers: z.boolean(),
	migration_draft: MigrationDraftSchema.nullable(),
	// Null for a brand-new plan; otherwise the change vs the current plan.
	diff: PlanPreviewDiffSchema.nullable(),
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
