import { ApiFeatureProcessorsSchema } from "@api/features/components/processors.js";
import { CreateFeatureV2ParamsSchema } from "@api/features/crud/createFeatureParams.js";
import { MigrationParamsSchema } from "@api/products/crud/migrationParams.js";
import { z } from "zod/v4";
import { UpdateCatalogPlanParamsSchema } from "./planUpdate/params/catalogPlanParams.js";

// Intersection, not .extend — extend silently drops the create-schema refines.
export const UpdateCatalogFeatureParamsSchema = z.intersection(
	CreateFeatureV2ParamsSchema,
	z.object({
		internal_id: z.string().nonempty().optional().meta({
			description:
				"Address an existing feature by its stable id. Omit when creating — the server generates one. A differing feature_id alongside it is a rename.",
			internal: true,
		}),
		new_feature_id: z.string().optional().meta({
			description: "Rename the feature to this id.",
		}),
		archived: z.boolean().optional().meta({
			description:
				"Archive or unarchive the feature. Omit to leave archived state unchanged.",
		}),
		processors: ApiFeatureProcessorsSchema.optional().meta({
			description:
				"Processor mappings for this feature. Omit keeps the current Stripe product and meter.",
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

export const RemoveCatalogPlanParamsSchema = z.object({
	plan_id: z.string().meta({
		description: "The ID of the plan to remove from the catalog.",
	}),
	version: z.number().int().min(1).optional().meta({
		description:
			"Pin a single version to remove. Omit to remove every version of this plan.",
	}),
});

export type RemoveCatalogPlanParams = z.infer<
	typeof RemoveCatalogPlanParamsSchema
>;

export const UpdateCatalogParamsSchema = z.object({
	// No .default([]) on the desired-state collections: a default would erase the
	// difference between "I manage features and there are none" and "I never
	// mentioned features", which under skip_deletions:false mean opposite things.
	features: z.array(UpdateCatalogFeatureParamsSchema).optional(),
	remove_features: z
		.array(RemoveCatalogFeatureParamsSchema)
		.optional()
		.default([]),
	plans: z.array(UpdateCatalogPlanParamsSchema).optional(),
	remove_plans: z.array(RemoveCatalogPlanParamsSchema).optional().default([]),

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

	skip_deletions: z.boolean().optional().default(true).meta({
		description:
			"When false the payload is the complete desired catalog: plans missing from it are removed. Defaults true, which leaves anything unmentioned alone.",
	}),
	skip_plan_ids: z.array(z.string()).optional().default([]).meta({
		description:
			"Plans to leave untouched under skip_deletions:false, matched against plan_id and new_plan_id.",
	}),
	skip_feature_ids: z.array(z.string()).optional().default([]).meta({
		description: "Features to leave untouched under skip_deletions:false.",
	}),

	migration: MigrationParamsSchema.optional().meta({
		description:
			"Catalog-wide migration default, overridable per plan. draft: true asks the server to draft a migration for every row an edit leaves customers behind on.",
	}),
	// expand: z.array(CatalogExpandSchema).optional(),
});

export type UpdateCatalogParams = z.infer<typeof UpdateCatalogParamsSchema>;
export type UpdateCatalogParamsInput = z.input<
	typeof UpdateCatalogParamsSchema
>;
