import {
	MigrationItemRunSkipReason,
	MigrationItemRunStatus,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Settles the page's `running` claims in one statement. A customer succeeds
 * iff it holds unpublished changes, from this attempt or an earlier one. */
export const markPageItemRuns = async ({
	db,
	migrationInternalId,
	migrationRunId,
	internalCustomerIds,
	excludedInternalCustomerIds,
	noUpdatesNeededInternalCustomerIds,
}: {
	db: DrizzleCli;
	migrationInternalId: string;
	migrationRunId: string;
	internalCustomerIds: string[];
	/** Customers a patch cannot serve: skipped as ineligible whatever they hold. */
	excludedInternalCustomerIds: string[];
	/** Unchanged customers still in scope; every other unchanged one is ineligible. */
	noUpdatesNeededInternalCustomerIds: string[];
}): Promise<{ succeededInternalCustomerIds: Set<string> }> => {
	if (internalCustomerIds.length === 0)
		return { succeededInternalCustomerIds: new Set() };

	const isExcluded = sql`item_id = ANY(${sql.param(excludedInternalCustomerIds)}::text[])`;
	const hasChanges = sql`unpublished_changes IS NOT NULL`;
	const settled = await db.execute<{ item_id: string; status: string }>(sql`
		UPDATE migration_item_runs
		SET status = CASE
				WHEN ${isExcluded} THEN ${MigrationItemRunStatus.Skipped}
				WHEN ${hasChanges} THEN ${MigrationItemRunStatus.Succeeded}
				ELSE ${MigrationItemRunStatus.Skipped}
			END,
			skip_reason = CASE
				WHEN ${isExcluded} THEN ${MigrationItemRunSkipReason.Ineligible}
				WHEN ${hasChanges} THEN NULL
				WHEN item_id = ANY(${sql.param(noUpdatesNeededInternalCustomerIds)}::text[])
				THEN ${MigrationItemRunSkipReason.NoUpdatesNeeded}
				ELSE ${MigrationItemRunSkipReason.Ineligible}
			END,
			updated_at = ${Date.now()}
		WHERE migration_internal_id = ${migrationInternalId}
			AND migration_run_id = ${migrationRunId}
			AND item_kind = 'customer'
			AND dry_run = false
			AND status = ${MigrationItemRunStatus.Running}
			AND item_id = ANY(${sql.param(internalCustomerIds)}::text[])
		RETURNING item_id, status
	`);

	return {
		succeededInternalCustomerIds: new Set(
			settled
				.filter((row) => row.status === MigrationItemRunStatus.Succeeded)
				.map((row) => row.item_id),
		),
	};
};
