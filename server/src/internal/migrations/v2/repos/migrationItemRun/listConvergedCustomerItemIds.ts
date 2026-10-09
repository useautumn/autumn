import {
	MigrationItemKind,
	MigrationItemRunSkipReason,
	MigrationItemRunStatus,
	migrationItemRuns,
} from "@autumn/shared";
import { and, asc, eq, gt, or } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

/** One keyset page of the internal customer ids a live run changed or found already
 * converged; a retry reports a customer an interrupted attempt changed as converged. */
export const listConvergedCustomerItemIds = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	afterItemId,
	limit,
}: {
	ctx: RepoContext;
	migrationInternalId: string;
	migrationRunId: string;
	afterItemId: string | null;
	limit: number;
}): Promise<string[]> => {
	const rows = await ctx.db
		.select({ itemId: migrationItemRuns.item_id })
		.from(migrationItemRuns)
		.where(
			and(
				eq(migrationItemRuns.migration_internal_id, migrationInternalId),
				eq(migrationItemRuns.item_kind, MigrationItemKind.Customer),
				eq(migrationItemRuns.dry_run, false),
				eq(migrationItemRuns.migration_run_id, migrationRunId),
				or(
					eq(migrationItemRuns.status, MigrationItemRunStatus.Succeeded),
					and(
						eq(migrationItemRuns.status, MigrationItemRunStatus.Skipped),
						eq(
							migrationItemRuns.skip_reason,
							MigrationItemRunSkipReason.NoUpdatesNeeded,
						),
					),
				),
				...(afterItemId ? [gt(migrationItemRuns.item_id, afterItemId)] : []),
			),
		)
		.orderBy(asc(migrationItemRuns.item_id))
		.limit(limit);
	return rows.map((row) => row.itemId);
};
