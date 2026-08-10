import { CreateFeatureV2ParamsSchema } from "@api/features/crud/createFeatureParams.js";
import { UpdatePlanParamsV2Schema } from "@api/products/crud/updatePlanParamsV1.js";
import { z } from "zod/v4";

// Intersection, not .extend — extend silently drops the create-schema refines.
export const UpdateCatalogFeatureParamsSchema = z.intersection(
	CreateFeatureV2ParamsSchema,
	z.object({
		new_feature_id: z.string().optional().meta({
			description: "Rename the feature to this id.",
		}),
		archived: z.boolean().optional().meta({
			description:
				"Archive or unarchive the feature. Omit to leave archived state unchanged.",
		}),
	}),
);

export type UpdateCatalogFeatureParams = z.infer<
	typeof UpdateCatalogFeatureParamsSchema
>;

export const RemoveCatalogFeatureParamsSchema = z.object({
	feature_id: z.string().meta({
		description: "The ID of the feature to remove from the catalog.",
	}),
});

export type RemoveCatalogFeatureParams = z.infer<
	typeof RemoveCatalogFeatureParamsSchema
>;

export const UpdateCatalogParamsSchema = z.object({
	features: z.array(UpdateCatalogFeatureParamsSchema).optional().default([]),
	remove_features: z
		.array(RemoveCatalogFeatureParamsSchema)
		.optional()
		.default([]),
	plans: z.array(UpdatePlanParamsV2Schema).optional().default([]),

	// rewards: z.array(CreateRewardParamsSchema).optional().meta({
	// 	description:
	// 		"Desired rewards. Omit to leave rewards untouched; [] with skip_deletions false deletes them all.",
	// }),
	// referral_programs: z
	// 	.array(CreateReferralProgramParamsSchema)
	// 	.optional()
	// 	.meta({
	// 		description:
	// 			"Desired referral programs. Same omit-vs-empty semantics as rewards.",
	// 	}),

	// skip_deletions: z.boolean().optional().default(true).meta({
	// 	description:
	// 		"When false, plans and features missing from this payload are archived or deleted.",
	// }),
	// skip_plan_ids: z.array(z.string()).optional().default([]).meta({
	// 	description:
	// 		"Plans to leave untouched, matched against plan_id and new_plan_id.",
	// }),
	// skip_feature_ids: z.array(z.string()).optional().default([]),

	// migration: MigrationParamsSchema.optional().meta({
	// 	description: "Catalog-wide migration default, overridable per plan.",
	// }),
	// expand: z.array(CatalogExpandSchema).optional(),
});

export type UpdateCatalogParams = z.infer<typeof UpdateCatalogParamsSchema>;
export type UpdateCatalogParamsInput = z.input<
	typeof UpdateCatalogParamsSchema
>;
