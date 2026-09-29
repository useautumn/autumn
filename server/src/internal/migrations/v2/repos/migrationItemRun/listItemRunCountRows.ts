import {
	MigrationItemKind,
	type MigrationItemRunSkipReason,
	type MigrationItemRunStatus,
	type MigrationRun,
	migrationItemRuns,
} from "@autumn/shared";
import { and, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

export type MigrationItemRunCountRow = {
	migration_internal_id: string;
	migration_run_id: string | null;
	dry_run: boolean;
	status: MigrationItemRunStatus;
	skip_reason: MigrationItemRunSkipReason | null;
	count: number;
};

/** Item-run counts grouped by status and skip reason, for every live item of
 * `liveMigrationInternalIds` plus every item of `runs`. */
export const listItemRunCountRows = async ({
	ctx,
	liveMigrationInternalIds,
	runs,
}: {
	ctx: RepoContext;
	liveMigrationInternalIds: string[];
	runs: Pick<MigrationRun, "internal_id" | "migration_internal_id">[];
}): Promise<MigrationItemRunCountRow[]> => {
	const scopes: SQL[] = [];
	if (liveMigrationInternalIds.length > 0)
		scopes.push(
			and(
				inArray(
					migrationItemRuns.migration_internal_id,
					liveMigrationInternalIds,
				),
				eq(migrationItemRuns.dry_run, false),
			) as SQL,
		);
	if (runs.length > 0)
		scopes.push(
			and(
				inArray(
					migrationItemRuns.migration_internal_id,
					runs.map((run) => run.migration_internal_id),
				),
				inArray(
					migrationItemRuns.migration_run_id,
					runs.map((run) => run.internal_id),
				),
			) as SQL,
		);
	if (scopes.length === 0) return [];

	return ctx.db
		.select({
			migration_internal_id: migrationItemRuns.migration_internal_id,
			migration_run_id: migrationItemRuns.migration_run_id,
			dry_run: migrationItemRuns.dry_run,
			status: migrationItemRuns.status,
			skip_reason: migrationItemRuns.skip_reason,
			count: sql<number>`count(*)::int`,
		})
		.from(migrationItemRuns)
		.where(
			and(
				eq(migrationItemRuns.item_kind, MigrationItemKind.Customer),
				or(...scopes),
			),
		)
		.groupBy(
			migrationItemRuns.migration_internal_id,
			migrationItemRuns.migration_run_id,
			migrationItemRuns.dry_run,
			migrationItemRuns.status,
			migrationItemRuns.skip_reason,
		);
};
