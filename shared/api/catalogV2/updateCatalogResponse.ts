import { ApiFeatureV1Schema } from "@api/features/apiFeatureV1.js";
import { ApiPlanV1Schema } from "@api/products/apiPlanV1.js";
import { z } from "zod/v4";
import { CatalogActionSchema } from "./components/catalogAction.js";
import { CatalogMigrationSchema } from "./components/catalogMigration.js";

const CatalogAppliedResultSchema = z.object({
	id: z.string(),
	action: CatalogActionSchema.meta({
		description: "What was actually applied, including 'skip' and 'none'.",
	}),
});

/** Resolved post-update state plus what was actually done per requested entry. */
export const UpdateCatalogResponseSchema = z.object({
	plans: z.array(ApiPlanV1Schema),
	features: z.array(ApiFeatureV1Schema),
	results: z.object({
		plans: z.array(CatalogAppliedResultSchema),
		features: z.array(CatalogAppliedResultSchema),
	}),
	migrations: z
		.array(CatalogMigrationSchema)
		.optional()
		.meta({
			description:
				"Migration drafts created for in-place / all_versions plan updates that requested `migration.draft`.",
		}),
});

export type UpdateCatalogResponse = z.infer<typeof UpdateCatalogResponseSchema>;
