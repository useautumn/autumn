import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";

/** Set-based markSucceeded / markSkipped: flips the page's `running` claims in
 * one statement, inside the page transaction (visible only with mutations). */
export const markPageItemRuns = async ({
	db,
	migrationInternalId,
	internalCustomerIds,
	status,
}: {
	db: DrizzleCli;
	migrationInternalId: string;
	internalCustomerIds: string[];
	status: "succeeded" | "skipped";
}): Promise<void> => {
	if (internalCustomerIds.length === 0) return;

	await db.execute(sql`
		UPDATE migration_item_runs
		SET status = ${status}, updated_at = ${Date.now()}
		WHERE migration_internal_id = ${migrationInternalId}
			AND item_kind = 'customer'
			AND dry_run = false
			AND status = 'running'
			AND item_id IN (${sqlList({ values: internalCustomerIds })})
	`);
};
