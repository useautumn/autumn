import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Releases a failed page's unsettled claims as `failed` so a retry re-claims
 * them. Settled rows keep their status: a succeeded customer never regresses. */
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
			AND status = 'running'
			AND item_id = ANY(${sql.param(internalCustomerIds)}::text[])
		RETURNING item_id
	`);
	return rows.length;
};
