import { z } from "zod/v4";
import { CatalogFeatureUpdatePreviewSchema } from "./components/catalogFeatureUpdatePreview/catalogFeatureUpdatePreview.js";
import { CatalogMigrationUpdatePreviewSchema } from "./components/catalogMigration.js";
import { CatalogPlanUpdatePreviewSchema } from "./planUpdate/preview/catalogPlanPreview.js";
import {
	CatalogReferralProgramUpdatePreviewSchema,
	CatalogRewardUpdatePreviewSchema,
} from "./rewardUpdate/preview/catalogRewardPreview.js";

/** Preview of a catalog update. `plans[]` mirrors the request's direct entries; related versions nest under each row. */
export const PreviewUpdateCatalogResponseSchema = z.object({
	plans: z.array(CatalogPlanUpdatePreviewSchema),
	features: z.array(CatalogFeatureUpdatePreviewSchema),
	rewards: z.array(CatalogRewardUpdatePreviewSchema).optional().default([]),
	referral_programs: z
		.array(CatalogReferralProgramUpdatePreviewSchema)
		.optional()
		.default([]),
	migrations: z
		.array(CatalogMigrationUpdatePreviewSchema)
		.optional()
		.default([])
		.meta({
			description:
				"Migration drafts that would be created if this update is applied.",
		}),
	// problems: z.array(CatalogProblemSchema).default([]).meta({
	// 	description:
	// 		"Catalog-level validity issues (cycles, version gaps, conflicts). Per-plan and per-feature problems live on their entries.",
	// }),
});

export type PreviewUpdateCatalogResponse = z.infer<
	typeof PreviewUpdateCatalogResponseSchema
>;
