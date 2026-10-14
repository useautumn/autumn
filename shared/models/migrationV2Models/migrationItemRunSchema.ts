import { z } from "zod/v4";

export const MigrationItemRunSchema = z.object({
	migration_item_run_id: z.string(),
	migration_internal_id: z.string(),
	migration_run_id: z.string().nullable(),
	dry_run: z.boolean(),
	item_kind: z.string(),
	item_id: z.string(),
	status: z.enum(["running", "succeeded", "skipped", "failed"]),
	skip_reason: z.enum(["no_updates_needed", "ineligible"]).nullish(),
	timestamp: z.union([z.string(), z.date()]).nullish(),
	created_at: z.number(),
	updated_at: z.number().nullable(),
});

export type MigrationItemRunData = z.infer<typeof MigrationItemRunSchema>;
