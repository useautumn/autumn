import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Flips a page's claims to `failed` so a retry re-claims them: after a stalled
 * page (late marks then find no `running` row) or a dropped cache invalidation. */
export const failPageItemRuns = async ({
	db,
	migrationInternalId,
	migrationRunId,
	internalCustomerIds,
}: {
	db: DrizzleCli;
	migrationInternalId: string;
	migrationRunId: string;
	internalCustomerIds: string[];
}): Promise<number> => {
	if (internalCustomerIds.length === 0) return 0;

	const rows = await db.execute<{ item_id: string }>(sql`
		UPDATE migration_item_runs
		SET status = 'failed', updated_at = ${Date.now()}
		WHERE migration_internal_id = ${migrationInternalId}
			AND migration_run_id = ${migrationRunId}
			AND item_kind = 'customer'
			AND dry_run = false
			AND status IN ('running', 'succeeded', 'skipped')
			AND item_id = ANY(${sql.param(internalCustomerIds)}::text[])
		RETURNING item_id
	`);
	return rows.length;
};
