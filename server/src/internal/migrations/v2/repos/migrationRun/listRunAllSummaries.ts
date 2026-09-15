import { migrationRuns } from "@autumn/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

export type MigrationRunAllSummary = {
	migration_internal_id: string;
	has_started_run_all: boolean;
};

/** Per migration: whether any Run All (live, unscoped) ever reached
 * execution. `started_at` is written only when execution starts, so a run
 * that failed or was canceled at dispatch does not count. */
export const listRunAllSummaries = async ({
	ctx,
	migrationInternalIds,
}: {
	ctx: RepoContext;
	migrationInternalIds: string[];
}): Promise<Map<string, MigrationRunAllSummary>> => {
	if (migrationInternalIds.length === 0) return new Map();

	const rows = await ctx.db
		.select({
			migration_internal_id: migrationRuns.migration_internal_id,
			has_started_run_all: sql<boolean>`bool_or(${migrationRuns.started_at} IS NOT NULL)`,
		})
		.from(migrationRuns)
		.where(
			and(
				eq(migrationRuns.org_id, ctx.org.id),
				eq(migrationRuns.env, ctx.env),
				eq(migrationRuns.dry_run, false),
				isNull(migrationRuns.only_ids),
				isNull(migrationRuns.target_limit),
				inArray(migrationRuns.migration_internal_id, migrationInternalIds),
			),
		)
		.groupBy(migrationRuns.migration_internal_id);

	return new Map(rows.map((row) => [row.migration_internal_id, row]));
};
