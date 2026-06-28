import { CreateFeatureV2ParamsSchema } from "@api/features/crud/createFeatureParams.js";
import { UpdatePlanParamsV2Schema } from "@api/products/crud/updatePlanParamsV1.js";
import { z } from "zod/v4";

/**
 * A batch change to the org's catalog (features + plans), applied/previewed in
 * one call. Plans are upserted by `plan_id` (exists → update, else create);
 * features by `feature_id`. `disable_version` per plan controls in-place vs
 * versioned updates (same semantics as plans.update).
 */
export const CatalogUpdateParamsSchema = z.object({
	features: z.array(CreateFeatureV2ParamsSchema).optional().default([]),
	plans: z.array(UpdatePlanParamsV2Schema).optional().default([]),
	skip_deletions: z.boolean().optional().default(true),
	expand: z.array(z.string()).optional(),
	// Atomically create (not run) a migration draft for in-place plan updates
	// that change a plan with existing customers.
	create_migration: z.boolean().optional().default(false),
});

export type CatalogUpdateParams = z.infer<typeof CatalogUpdateParamsSchema>;
export type CatalogUpdateParamsInput = z.input<
	typeof CatalogUpdateParamsSchema
>;
