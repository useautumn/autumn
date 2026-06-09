import {
	MigrationItemKind,
	MigrationItemRunStatus,
	migrationItemRuns,
} from "@autumn/shared";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

export type MigrationItemRunCounts = {
	total: number;
	running: number;
	succeeded: number;
	skipped: number;
	failed: number;
};

export type MigrationItemRunCountsByRun = MigrationItemRunCounts & {
	migration_run_id: string | null;
};

const countSelection = {
	total: sql<number>`count(*)::int`,
	running: sql<number>`count(*) filter (where ${migrationItemRuns.status} = ${MigrationItemRunStatus.Running})::int`,
	succeeded: sql<number>`count(*) filter (where ${migrationItemRuns.status} = ${MigrationItemRunStatus.Succeeded})::int`,
	skipped: sql<number>`count(*) filter (where ${migrationItemRuns.status} = ${MigrationItemRunStatus.Skipped})::int`,
	failed: sql<number>`count(*) filter (where ${migrationItemRuns.status} = ${MigrationItemRunStatus.Failed})::int`,
};

const emptyCounts: MigrationItemRunCounts = {
	total: 0,
	running: 0,
	succeeded: 0,
	skipped: 0,
	failed: 0,
};

export const listMigrationItemRunCountsByRun = async ({
	ctx,
	migrationInternalId,
	migrationRunIds,
	itemKind = MigrationItemKind.Customer,
}: {
	ctx: RepoContext;
	migrationInternalId: string;
	migrationRunIds: string[];
	itemKind?: MigrationItemKind;
}): Promise<MigrationItemRunCountsByRun[]> => {
	if (migrationRunIds.length === 0) return [];

	return ctx.db
		.select({
			migration_run_id: migrationItemRuns.migration_run_id,
			...countSelection,
		})
		.from(migrationItemRuns)
		.where(
			and(
				eq(migrationItemRuns.migration_internal_id, migrationInternalId),
				eq(migrationItemRuns.item_kind, itemKind),
				inArray(migrationItemRuns.migration_run_id, migrationRunIds),
			),
		)
		.groupBy(migrationItemRuns.migration_run_id);
};

export const getMigrationItemRunCounts = async ({
	ctx,
	migrationInternalId,
	itemKind = MigrationItemKind.Customer,
	dryRun,
	migrationRunId,
}: {
	ctx: RepoContext;
	migrationInternalId: string;
	itemKind?: MigrationItemKind;
	dryRun?: boolean;
	migrationRunId?: string;
}): Promise<MigrationItemRunCounts> => {
	const where: SQL[] = [
		eq(migrationItemRuns.migration_internal_id, migrationInternalId),
		eq(migrationItemRuns.item_kind, itemKind),
	];

	if (dryRun !== undefined) where.push(eq(migrationItemRuns.dry_run, dryRun));
	if (migrationRunId !== undefined)
		where.push(eq(migrationItemRuns.migration_run_id, migrationRunId));

	const [counts] = await ctx.db
		.select(countSelection)
		.from(migrationItemRuns)
		.where(and(...where));

	return counts ?? emptyCounts;
};
