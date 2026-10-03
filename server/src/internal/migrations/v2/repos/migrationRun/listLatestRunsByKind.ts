import {
	ACTIVE_MIGRATION_RUN_STATUSES,
	type MigrationRun,
	migrationRuns,
} from "@autumn/shared";
import {
	and,
	desc,
	eq,
	getTableColumns,
	inArray,
	isNotNull,
	not,
	or,
} from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";
import {
	isRunAllSql,
	type MigrationRunKind,
	migrationRunKindSql,
} from "../../utils/migrationRunKind.js";

export type MigrationRunWithKind = MigrationRun & { kind: MigrationRunKind };

const isActive = inArray(migrationRuns.status, ACTIVE_MIGRATION_RUN_STATUSES);

/**
 * One run per (migration, kind): the active or latest started Run All, and
 * the latest finished dry run and scoped live run, whatever their outcome.
 */
export const listLatestRunsByKind = async ({
	ctx,
	migrationInternalIds,
}: {
	ctx: RepoContext;
	migrationInternalIds: string[];
}): Promise<MigrationRunWithKind[]> => {
	if (migrationInternalIds.length === 0) return [];

	return ctx.db
		.selectDistinctOn(
			[migrationRuns.migration_internal_id, migrationRunKindSql],
			{
				...getTableColumns(migrationRuns),
				kind: migrationRunKindSql,
			},
		)
		.from(migrationRuns)
		.where(
			and(
				eq(migrationRuns.org_id, ctx.org.id),
				eq(migrationRuns.env, ctx.env),
				inArray(migrationRuns.migration_internal_id, migrationInternalIds),
				or(
					and(isRunAllSql, or(isNotNull(migrationRuns.started_at), isActive)),
					and(isNotNull(migrationRuns.finished_at), not(isRunAllSql)),
				),
			),
		)
		.orderBy(
			migrationRuns.migration_internal_id,
			migrationRunKindSql,
			desc(isActive),
			desc(migrationRuns.created_at),
		);
};
