import {
	type Migration,
	type MigrationListItemCounts,
	type MigrationListSummary,
	type MigrationRun,
	MigrationRunStatus,
} from "@autumn/shared";
import pLimit from "p-limit";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type MigrationItemRunCountRow,
	migrationItemRunRepo,
	migrationRunRepo,
} from "../../repos/index.js";
import type { MigrationRunWithKind } from "../../repos/migrationRun/index.js";
import { countCustomersCached } from "../countCustomersCached.js";

const CUSTOMER_COUNT_CONCURRENCY = 4;

type MigrationRef = Pick<
	Migration,
	"internal_id" | "id" | "filter" | "archived" | "created_at" | "updated_at"
>;

const countMatchedCustomers = async ({
	ctx,
	migration,
}: {
	ctx: AutumnContext;
	migration: MigrationRef;
}): Promise<number | null> => {
	const filter = migration.filter?.customer;
	if (
		migration.archived ||
		!filter ||
		!Object.values(filter).some((value) => value !== undefined)
	)
		return null;

	try {
		return await countCustomersCached({
			ctx,
			filter,
			includeProcessed: { migrationInternalId: migration.internal_id },
			cacheScope: {
				migrationId: migration.id,
				source: "filter",
				executionStatuses: [],
			},
		});
	} catch (error) {
		ctx.logger.warn(`Migration ${migration.id} customer count failed`, {
			error,
		});
		return null;
	}
};

const tallyCounts = (
	rows: MigrationItemRunCountRow[],
): MigrationListItemCounts => {
	const counts: MigrationListItemCounts = {
		total: 0,
		running: 0,
		succeeded: 0,
		no_updates_needed: 0,
		ineligible: 0,
		failed: 0,
	};
	for (const row of rows) {
		counts.total += row.count;
		if (row.status === "skipped") {
			const bucket =
				row.skip_reason === "no_updates_needed"
					? "no_updates_needed"
					: "ineligible";
			counts[bucket] += row.count;
		} else {
			counts[row.status] += row.count;
		}
	}
	return counts;
};

const runOutcomeActivity = (
	run: MigrationRunWithKind,
): MigrationListSummary["last_activity"] => {
	if (run.status === MigrationRunStatus.Queued)
		return { kind: "queued", at: run.created_at };
	if (run.status === MigrationRunStatus.Running)
		return { kind: "started", at: run.started_at ?? run.created_at };
	const at = run.finished_at ?? run.started_at ?? run.created_at;
	if (run.status === MigrationRunStatus.Failed) return { kind: "failed", at };
	if (run.status === MigrationRunStatus.Canceled)
		return { kind: "canceled", at };
	return { kind: "finished", at };
};

/** Live runs of other migrations that hold or precede this queued Run All. */
const countRunsAhead = ({
	run,
	activeRuns,
}: {
	run: MigrationRunWithKind;
	activeRuns: MigrationRun[];
}): number =>
	activeRuns.filter(
		(active) =>
			!active.dry_run &&
			active.migration_internal_id !== run.migration_internal_id &&
			(active.status === MigrationRunStatus.Running ||
				active.created_at < run.created_at),
	).length;

const summarizeMigration = ({
	migration,
	runs,
	countRows,
	activeRuns,
	customerCount,
}: {
	migration: MigrationRef;
	runs: MigrationRunWithKind[];
	countRows: MigrationItemRunCountRow[];
	activeRuns: MigrationRun[];
	customerCount: number | null;
}): MigrationListSummary => {
	const runAll = runs.find((run) => run.kind === "run_all");
	const dryRun = runs.find((run) => run.kind === "dry_run");
	const sample = runs.find((run) => run.kind === "sample");
	const countsForRun = (run: MigrationRunWithKind) =>
		tallyCounts(
			countRows.filter((row) =>
				run.kind === "run_all"
					? !row.dry_run
					: row.migration_run_id === run.internal_id,
			),
		);
	const dryCounts = dryRun ? countsForRun(dryRun) : null;

	const activities: MigrationListSummary["last_activity"][] = [
		{ kind: "created", at: migration.created_at },
	];
	if (migration.updated_at && migration.updated_at > migration.created_at)
		activities.push({ kind: "edited", at: migration.updated_at });
	if (runAll) activities.push(runOutcomeActivity(runAll));
	if (dryRun?.finished_at)
		activities.push({ kind: "dry_run", at: dryRun.finished_at });
	if (sample?.finished_at)
		activities.push({ kind: "sample", at: sample.finished_at });

	return {
		customer_count: customerCount,
		latest_run: runAll
			? {
					status: runAll.status,
					started_at: runAll.started_at,
					finished_at: runAll.finished_at,
					error_message: runAll.error_message,
					counts: countsForRun(runAll),
				}
			: null,
		latest_dry_run:
			dryRun?.finished_at && dryCounts
				? {
						status: dryRun.status,
						finished_at: dryRun.finished_at,
						previewed: dryCounts.total,
						would_change: dryCounts.succeeded,
						would_fail: dryCounts.failed,
					}
				: null,
		latest_sample: sample?.finished_at
			? {
					status: sample.status,
					size: countsForRun(sample).total,
					finished_at: sample.finished_at,
				}
			: null,
		queue_position:
			runAll?.status === MigrationRunStatus.Queued
				? countRunsAhead({ run: runAll, activeRuns })
				: null,
		last_activity: activities.reduce((latest, activity) =>
			activity.at > latest.at ? activity : latest,
		),
	};
};

/** Summarizes every migration's latest runs, item counts and filter size in a
 * fixed number of batched queries. */
export const summarizeMigrations = async ({
	ctx,
	migrations,
}: {
	ctx: AutumnContext;
	migrations: MigrationRef[];
}): Promise<Map<string, MigrationListSummary>> => {
	const limit = pLimit(CUSTOMER_COUNT_CONCURRENCY);
	const runsWithCounts = async () => {
		const latestRuns = await migrationRunRepo.listLatestByKind({
			ctx,
			migrationInternalIds: migrations.map(
				(migration) => migration.internal_id,
			),
		});
		const hasQueuedRunAll = latestRuns.some(
			(run) =>
				run.kind === "run_all" && run.status === MigrationRunStatus.Queued,
		);
		const [countRows, activeRuns] = await Promise.all([
			migrationItemRunRepo.listCountRows({
				ctx,
				liveMigrationInternalIds: latestRuns
					.filter((run) => run.kind === "run_all")
					.map((run) => run.migration_internal_id),
				runs: latestRuns.filter((run) => run.kind !== "run_all"),
			}),
			hasQueuedRunAll ? migrationRunRepo.list({ ctx, active: true }) : [],
		]);
		return { latestRuns, countRows, activeRuns };
	};
	const [{ latestRuns, countRows, activeRuns }, customerCounts] =
		await Promise.all([
			runsWithCounts(),
			Promise.all(
				migrations.map((migration) =>
					limit(() => countMatchedCustomers({ ctx, migration })),
				),
			),
		]);

	return new Map(
		migrations.map((migration, index) => {
			const belongsToMigration = (row: { migration_internal_id: string }) =>
				row.migration_internal_id === migration.internal_id;
			return [
				migration.internal_id,
				summarizeMigration({
					migration,
					runs: latestRuns.filter(belongsToMigration),
					countRows: countRows.filter(belongsToMigration),
					activeRuns,
					customerCount: customerCounts[index],
				}),
			];
		}),
	);
};
