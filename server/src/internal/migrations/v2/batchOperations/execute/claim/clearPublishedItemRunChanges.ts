import type { MigrationItemChange } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Clears only the settled snapshot that was published; a late publisher must
 * not erase newer changes appended by a retry. */
export const clearPublishedItemRunChanges = async ({
	db,
	migrationInternalId,
	publishedSnapshots,
}: {
	db: DrizzleCli;
	migrationInternalId: string;
	publishedSnapshots: {
		internalCustomerId: string;
		migrationRunId: string | null;
		changes: MigrationItemChange[] | null;
	}[];
}): Promise<void> => {
	if (publishedSnapshots.length === 0) return;
	const snapshots = publishedSnapshots.map((snapshot) => ({
		item_id: snapshot.internalCustomerId,
		migration_run_id: snapshot.migrationRunId,
		changes: snapshot.changes,
	}));

	await db.execute(sql`
		UPDATE migration_item_runs AS mir
		SET unpublished_changes = NULL
		FROM jsonb_to_recordset(${JSON.stringify(snapshots)}::jsonb)
			AS published(item_id text, migration_run_id text, changes jsonb)
		WHERE mir.migration_internal_id = ${migrationInternalId}
			AND mir.item_kind = 'customer'
			AND mir.dry_run = false
			AND mir.status IN ('succeeded', 'skipped')
			AND mir.item_id = published.item_id
			AND mir.migration_run_id IS NOT DISTINCT FROM published.migration_run_id
			AND mir.unpublished_changes = published.changes
	`);
};
