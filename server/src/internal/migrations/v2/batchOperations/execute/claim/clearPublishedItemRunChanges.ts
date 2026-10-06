import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Clears published changes from settled item runs only: a failed or running
 * run keeps its changes until a retry settles it. */
export const clearPublishedItemRunChanges = async ({
	db,
	migrationInternalId,
	internalCustomerIds,
}: {
	db: DrizzleCli;
	migrationInternalId: string;
	internalCustomerIds: string[];
}): Promise<void> => {
	if (internalCustomerIds.length === 0) return;

	await db.execute(sql`
		UPDATE migration_item_runs
		SET unpublished_changes = NULL
		WHERE migration_internal_id = ${migrationInternalId}
			AND item_kind = 'customer'
			AND dry_run = false
			AND status IN ('succeeded', 'skipped')
			AND item_id = ANY(${sql.param(internalCustomerIds)}::text[])
	`);
};
