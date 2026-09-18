import { type MigrationRunStatus, migrationRuns } from "@autumn/shared";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

/** `started_at` is written when execution starts, not at dispatch. */
export const listLatestRunAllStatuses = async ({
	ctx,
	migrationInternalIds,
}: {
	ctx: RepoContext;
	migrationInternalIds: string[];
}): Promise<Map<string, MigrationRunStatus>> => {
	if (migrationInternalIds.length === 0) return new Map();

	const rows = await ctx.db
		.selectDistinctOn([migrationRuns.migration_internal_id], {
			migration_internal_id: migrationRuns.migration_internal_id,
			status: migrationRuns.status,
		})
		.from(migrationRuns)
		.where(
			and(
				eq(migrationRuns.org_id, ctx.org.id),
				eq(migrationRuns.env, ctx.env),
				eq(migrationRuns.dry_run, false),
				isNull(migrationRuns.only_ids),
				isNull(migrationRuns.target_limit),
				isNotNull(migrationRuns.started_at),
				inArray(migrationRuns.migration_internal_id, migrationInternalIds),
			),
		)
		.orderBy(
			migrationRuns.migration_internal_id,
			desc(migrationRuns.created_at),
		);

	return new Map(
		rows.map((row) => [
			row.migration_internal_id,
			row.status as MigrationRunStatus,
		]),
	);
};
