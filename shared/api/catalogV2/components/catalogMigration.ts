import { MigrationFilterSchema } from "@api/migrations/filters/migrationFilter.js";
import { OperationsSchema } from "@api/migrations/operations/operations.js";
import { z } from "zod/v4";

export const CatalogMigrationPlanSchema = z.object({
	plan_id: z.string(),
	versions: z.array(z.number().int()).meta({
		description:
			"Versions of this plan whose customers the draft targets. Omitted versions (no customers, mint, empty diff) are excluded.",
	}),
});

/** Migration draft as returned by catalog preview/update — the object that would run. */
export const CatalogMigrationUpdatePreviewSchema = z.object({
	plans: z.array(CatalogMigrationPlanSchema).meta({
		description: "Plans and versions whose customers this migration targets.",
	}),
	include_custom: z.boolean().default(false).meta({
		description:
			"Echo of the `migration.include_custom` param — whether customized plans are matched.",
	}),
	filter: MigrationFilterSchema,
	operations: OperationsSchema,
	no_billing_changes: z.boolean(),
});

/** Update additionally returns the persisted migration id; preview ids are never stable. */
export const CatalogMigrationSchema =
	CatalogMigrationUpdatePreviewSchema.extend({
		id: z.string(),
	});

export type CatalogMigrationPlan = z.infer<typeof CatalogMigrationPlanSchema>;
export type CatalogMigrationUpdatePreview = z.infer<
	typeof CatalogMigrationUpdatePreviewSchema
>;
export type CatalogMigration = z.infer<typeof CatalogMigrationSchema>;
