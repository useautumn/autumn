import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Set-based settle of the page's `running` claims: flips them to succeeded or
 * skipped in one statement, inside the page transaction (visible only with
 * mutations). Only settles claims held by this run. */
export const markPageItemRuns = async ({
	db,
	migrationInternalId,
	migrationRunId,
	succeededInternalCustomerIds,
	skippedInternalCustomerIds,
}: {
	db: DrizzleCli;
	migrationInternalId: string;
	/** Settle only rows THIS run claimed — a concurrent run sharing the
	 * migration must never flip another run's claims. */
	migrationRunId: string;
	succeededInternalCustomerIds: string[];
	skippedInternalCustomerIds: string[];
}): Promise<void> => {
	const allIds = [
		...succeededInternalCustomerIds,
		...skippedInternalCustomerIds,
	];
	if (allIds.length === 0) return;

	await db.execute(sql`
		UPDATE migration_item_runs
		SET status = CASE
				WHEN item_id = ANY(${sql.param(succeededInternalCustomerIds)}::text[])
				THEN 'succeeded' ELSE 'skipped'
			END,
			updated_at = ${Date.now()}
		WHERE migration_internal_id = ${migrationInternalId}
			AND migration_run_id = ${migrationRunId}
			AND item_kind = 'customer'
			AND dry_run = false
			AND status = 'running'
			AND item_id = ANY(${sql.param(allIds)}::text[])
	`);
};
