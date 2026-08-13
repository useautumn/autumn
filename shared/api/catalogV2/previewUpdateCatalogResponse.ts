import { z } from "zod/v4";
import { CatalogFeatureUpdatePreviewSchema } from "./components/catalogFeatureUpdatePreview/catalogFeatureUpdatePreview.js";
import { CatalogMigrationUpdatePreviewSchema } from "./components/catalogMigration.js";
import { CatalogPlanUpdatePreviewSchema } from "./components/catalogPlanUpdatePreview/catalogPlanUpdatePreview.js";

/** Total preview: every affected plan/feature is always included — no include_* flags. */
export const PreviewUpdateCatalogResponseSchema = z.object({
	plans: z.array(CatalogPlanUpdatePreviewSchema),
	features: z.array(CatalogFeatureUpdatePreviewSchema),
	migrations: z
		.array(CatalogMigrationUpdatePreviewSchema)
		.optional()
		.default([])
		.meta({
			description:
				"Migration drafts that would be created if this update is applied.",
		}),
	// rewards: z.array(CatalogConfigResourcePreviewSchema),
	// referral_programs: z.array(CatalogConfigResourcePreviewSchema),
	// problems: z.array(CatalogProblemSchema).default([]).meta({
	// 	description:
	// 		"Catalog-level validity issues (cycles, version gaps, conflicts). Per-plan and per-feature problems live on their entries.",
	// }),
});

export type PreviewUpdateCatalogResponse = z.infer<
	typeof PreviewUpdateCatalogResponseSchema
>;
