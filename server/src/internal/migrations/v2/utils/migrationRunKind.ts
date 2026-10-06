import { type MigrationRun, migrationRuns } from "@autumn/shared";
import { sql } from "drizzle-orm";

export type MigrationRunKind = "run_all" | "dry_run" | "sample";

/** A Run All is a live run over the whole filter; only it moves migration status
 * and reports migration-wide item counts, since re-runs reuse item rows. */
export const isRunAll = (
	run: Pick<MigrationRun, "dry_run" | "only_ids" | "target_limit">,
): boolean =>
	!run.dry_run && run.only_ids === null && run.target_limit === null;

export const isRunAllSql = sql`(${migrationRuns.dry_run} = false AND ${migrationRuns.only_ids} IS NULL AND ${migrationRuns.target_limit} IS NULL)`;

export const migrationRunKindSql = sql<MigrationRunKind>`CASE
	WHEN ${isRunAllSql} THEN 'run_all'
	WHEN ${migrationRuns.dry_run} THEN 'dry_run'
	ELSE 'sample'
END`;
