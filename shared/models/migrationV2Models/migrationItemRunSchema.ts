import { z } from "zod/v4";

/**
 * Zod mirror of the `migration_item_runs` row shape. Used for FullSubject /
 * FullCustomer cache hole-filling and as the canonical schema-derived type
 * (`MigrationItemRunData`) for embedded `migration_item_runs` on those.
 *
 * Looser than the Drizzle table type by design — `timestamp` arrives as a
 * string after `row_to_json` JSON serialization, and embedded item_runs only
 * need shallow consumers (the lazy migration helper).
 */
export const MigrationItemRunSchema = z.object({
	migration_item_run_id: z.string(),
	migration_internal_id: z.string(),
	migration_run_id: z.string().nullable(),
	dry_run: z.boolean(),
	item_kind: z.string(),
	item_id: z.string(),
	status: z.enum(["running", "succeeded", "skipped", "failed"]),
	timestamp: z.union([z.string(), z.date()]).nullish(),
	created_at: z.number(),
	updated_at: z.number().nullable(),
});

export type MigrationItemRunData = z.infer<typeof MigrationItemRunSchema>;
